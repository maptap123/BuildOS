#!/usr/bin/env tsx
/**
 * Links BuilderTrend contacts to jobs and copies the client's phone/email onto
 * the job record.
 *
 * The problem this fixes: BT's per-job contacts endpoint returns the whole
 * company address book with jobId null on every record, so the import left
 * contacts.job_id NULL on all 740 rows and jobs.client_phone NULL on every job.
 * The result is that no job screen can show a client's number -- the crew has to
 * search the Contacts directory by name instead.
 *
 * Matching is by client name, in two tiers, and only ever writes an unambiguous
 * match:
 *   exact   -- normalised full_name == normalised client_name
 *   surname -- same surname and a shared given name, and exactly one candidate
 *
 * jobs.client_phone/client_email are safe to set on many jobs from one contact
 * (repeat clients). contacts.job_id is a single FK, so it is only set when the
 * contact matches exactly one job.
 *
 * Usage:
 *   npx tsx scripts/bt-link-job-contacts.ts            # dry run + match report
 *   npx tsx scripts/bt-link-job-contacts.ts --apply
 *   npx tsx scripts/bt-link-job-contacts.ts --apply --phones-only
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}
loadEnvFile(join(process.cwd(), '.env.local'));

const APPLY = process.argv.includes('--apply');
const PHONES_ONLY = process.argv.includes('--phones-only');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type Job = {
  id: string;
  job_number: string;
  name: string;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  status: string;
};
type Contact = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  job_id: string | null;
};

const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Compare phone numbers by digits alone -- BT stores 513-633-1221 and 5136331221. */
const digitsOnly = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** "Joe and Kim Vogel" -> given names ["joe","kim"], surname "vogel" */
function nameParts(raw: string | null | undefined) {
  const tokens = norm(raw).split(' ').filter((t) => t && t !== 'and');
  if (!tokens.length) return null;
  return { given: tokens.slice(0, -1), surname: tokens[tokens.length - 1], all: tokens };
}

/** Page past PostgREST's max-rows cap instead of trusting .limit(). */
async function fetchAllRows<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function main() {
  console.log(`\nLink job contacts  ${APPLY ? '[APPLY]' : '[DRY RUN]'}${PHONES_ONLY ? '  (phones only)' : ''}\n`);

  const jobs = await fetchAllRows<Job>(
    'jobs',
    'id, job_number, name, client_name, client_phone, client_email, status'
  );
  const contacts = await fetchAllRows<Contact>('contacts', 'id, full_name, phone, email, job_id');
  console.log(`  ${jobs.length} jobs, ${contacts.length} contacts`);

  const withPhone = contacts.filter((c) => c.phone && c.phone.trim());
  console.log(`  ${withPhone.length} contacts carry a phone number\n`);

  const byExact = new Map<string, Contact[]>();
  for (const c of contacts) {
    const k = norm(c.full_name);
    if (!k) continue;
    if (!byExact.has(k)) byExact.set(k, []);
    byExact.get(k)!.push(c);
  }

  type Match = { job: Job; contact: Contact; tier: 'exact' | 'surname' };
  const matches: Match[] = [];
  const unmatched: Job[] = [];
  let ambiguous = 0;

  for (const job of jobs) {
    const jp = nameParts(job.client_name);
    if (!jp) {
      unmatched.push(job);
      continue;
    }

    // tier 1 -- exact normalised name
    const exact = byExact.get(norm(job.client_name)) ?? [];
    const exactWithPhone = exact.filter((c) => c.phone?.trim());
    if (exactWithPhone.length === 1) {
      matches.push({ job, contact: exactWithPhone[0], tier: 'exact' });
      continue;
    }
    if (exact.length === 1) {
      matches.push({ job, contact: exact[0], tier: 'exact' });
      continue;
    }
    if (exact.length > 1) {
      // Several contacts share the client's name. That is only genuinely
      // ambiguous if they disagree about the phone number -- BT's address book
      // holds plenty of straight duplicates, and picking either of two records
      // carrying the same number is safe. Only bail when they actually differ.
      const phones = new Set(exactWithPhone.map((c) => digitsOnly(c.phone)).filter(Boolean));
      if (phones.size === 1 && exactWithPhone.length > 0) {
        matches.push({ job, contact: exactWithPhone[0], tier: 'exact' });
        continue;
      }
      ambiguous++;
      unmatched.push(job);
      continue;
    }

    // tier 2 -- same surname AND a shared given name, exactly one candidate
    const cands = contacts.filter((c) => {
      const cp = nameParts(c.full_name);
      if (!cp || cp.surname !== jp.surname) return false;
      return cp.given.some((g) => jp.given.includes(g));
    });
    const candsWithPhone = cands.filter((c) => c.phone?.trim());
    const pick = candsWithPhone.length === 1 ? candsWithPhone : cands;
    if (pick.length === 1) {
      matches.push({ job, contact: pick[0], tier: 'surname' });
      continue;
    }
    if (pick.length > 1) ambiguous++;
    unmatched.push(job);
  }

  const isLive = (j: Job) => j.status === 'active' || j.status === 'presale' || j.status === 'warranty';
  const exactN = matches.filter((m) => m.tier === 'exact').length;
  const surnameN = matches.filter((m) => m.tier === 'surname').length;
  const withPhoneN = matches.filter((m) => m.contact.phone?.trim()).length;
  const liveMatched = matches.filter((m) => isLive(m.job)).length;
  const liveTotal = jobs.filter(isLive).length;

  console.log(`  matched            : ${matches.length}/${jobs.length}   (exact ${exactN}, surname ${surnameN})`);
  console.log(`  ...of which phoned : ${withPhoneN}`);
  console.log(`  live jobs matched  : ${liveMatched}/${liveTotal}`);
  console.log(`  ambiguous          : ${ambiguous}`);
  console.log(`  unmatched          : ${unmatched.length}\n`);

  // contacts.job_id only where a contact maps to exactly one job
  const jobsPerContact = new Map<string, Match[]>();
  for (const m of matches) {
    if (!jobsPerContact.has(m.contact.id)) jobsPerContact.set(m.contact.id, []);
    jobsPerContact.get(m.contact.id)!.push(m);
  }
  const soleLinks = [...jobsPerContact.entries()].filter(([, ms]) => ms.length === 1);
  const sharedContacts = [...jobsPerContact.entries()].filter(([, ms]) => ms.length > 1);
  console.log(`  contacts.job_id writable (1 job each) : ${soleLinks.length}`);
  console.log(`  repeat clients (contact spans jobs)   : ${sharedContacts.length}\n`);

  const phoneUpdates = matches.filter(
    (m) =>
      (m.contact.phone?.trim() && !m.job.client_phone) ||
      (m.contact.email?.trim() && !m.job.client_email)
  );
  console.log(`  jobs gaining a phone/email : ${phoneUpdates.length}`);

  console.log(`\n  sample matches:`);
  for (const m of matches.slice(0, 8)) {
    const client = String(m.job.client_name).slice(0, 26).padEnd(28);
    const contact = String(m.contact.full_name).padEnd(22);
    console.log(`    ${m.job.job_number.padEnd(10)} ${client} -> ${contact} ${m.contact.phone ?? '(none)'}  [${m.tier}]`);
  }
  if (unmatched.length) {
    console.log(`\n  sample unmatched (live jobs):`);
    for (const j of unmatched.filter(isLive).slice(0, 8)) {
      console.log(`    ${j.job_number.padEnd(10)} ${j.name.slice(0, 30).padEnd(32)} client="${j.client_name ?? ''}"`);
    }
  }

  if (!APPLY) {
    console.log(`\n  Dry run. Re-run with --apply to write.\n`);
    return;
  }

  let phoned = 0;
  let linked = 0;
  for (const m of phoneUpdates) {
    const patch: Record<string, string> = {};
    if (m.contact.phone?.trim() && !m.job.client_phone) patch.client_phone = m.contact.phone.trim();
    if (m.contact.email?.trim() && !m.job.client_email) patch.client_email = m.contact.email.trim();
    if (!Object.keys(patch).length) continue;
    const { error } = await supabase.from('jobs').update(patch).eq('id', m.job.id);
    if (error) console.error(`  FAIL job ${m.job.job_number}: ${error.message}`);
    else phoned++;
  }
  console.log(`  jobs updated with client phone/email : ${phoned}`);

  if (!PHONES_ONLY) {
    for (const [contactId, ms] of soleLinks) {
      if (ms[0].contact.job_id) continue;
      const { error } = await supabase.from('contacts').update({ job_id: ms[0].job.id }).eq('id', contactId);
      if (error) console.error(`  FAIL contact ${contactId}: ${error.message}`);
      else linked++;
    }
    console.log(`  contacts linked to a job             : ${linked}`);
  }
  console.log();
}

main().catch((e) => {
  console.error('Fatal:', e.message ?? e);
  process.exit(1);
});
