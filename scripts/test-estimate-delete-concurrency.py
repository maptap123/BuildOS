#!/usr/bin/env python3
"""Real two-connection PostgreSQL race tests via Supabase Management API.

Opt in: SUPABASE_ACCESS_TOKEN=... python scripts/test-estimate-delete-concurrency.py
Only synthetic fixtures are inserted, with null public proposal tokens, archived
jobs, expired sessions, and completed worker requests. Every case cleans up and
verifies its exact UUIDs. Never uses real homeowner estimates. No third-party deps.
"""
import concurrent.futures
import json
import os
import time
import urllib.error
import urllib.request
import uuid

PROJECT = os.environ.get('SUPABASE_PROJECT_REF', 'hdebklbhscvmdnatngkp')
TOKEN = os.environ['SUPABASE_ACCESS_TOKEN']


def sql(query):
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{PROJECT}/database/query',
        headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'},
        data=json.dumps({'query': query}).encode())
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        return {'error': exc.read().decode()}


def ok(query):
    result = sql(query)
    assert isinstance(result, list), result
    return result


def wait_for(query):
    deadline = time.monotonic() + 4
    while time.monotonic() < deadline:
        if ok(query)[0]['ready']:
            return
        time.sleep(0.08)
    raise AssertionError('Expected live transaction/lock barrier not observed')


def run_case(pool, family, mode, first, isolation):
    e, other, lead, job, line, other_line, ref, batch = [str(uuid.uuid4()) for _ in range(8)]
    tag = 'estimate_guard_' + uuid.uuid4().hex[:12]
    user = ok('select id from public.users limit 1')[0]['id']
    tables = ['budget_lines', 'allowances', 'fixer_requests', 'chat_messages',
              'estimate_proposal_sessions', 'estimate_line_proposals']
    def ref_insert(target):
        if family == 'budget_lines':
            return f"INSERT INTO public.budget_lines(id,job_id,created_by,cost_code,category,description,notes) VALUES('{ref}','{job}','{user}','TEST','test','synthetic','Imported from estimate {target} suffix');"
        if family == 'allowances':
            target_line = line if target == e else other_line
            return f"INSERT INTO public.allowances(id,job_id,title,estimate_line_id) VALUES('{ref}','{job}','synthetic','{target_line}');"
        if family == 'fixer_requests':
            return f"INSERT INTO public.fixer_requests(id,estimate_id,user_id,message,status,finished_at) VALUES('{ref}','{target}','{user}','synthetic concurrency test','completed',now());"
        if family == 'chat_messages':
            return f"INSERT INTO public.chat_messages(id,estimate_id,role,content) VALUES('{ref}','{target}','assistant','synthetic concurrency test');"
        if family == 'estimate_proposal_sessions':
            return f"INSERT INTO public.estimate_proposal_sessions(estimate_id,expires_at) VALUES('{target}',now()-interval '1 day');"
        return f"INSERT INTO public.estimate_line_proposals(id,estimate_id,batch_id,description,status) VALUES('{ref}','{target}','{batch}','synthetic concurrency test','pending');"
    if mode == 'insert':
        write = ref_insert(e)
    elif family == 'budget_lines':
        write = f"UPDATE public.budget_lines SET notes='Imported from estimate {e} suffix' WHERE id='{ref}';"
    elif family == 'allowances':
        write = f"UPDATE public.allowances SET estimate_line_id='{line}' WHERE id='{ref}';"
    elif family == 'estimate_proposal_sessions':
        write = f"UPDATE public.estimate_proposal_sessions SET estimate_id='{e}' WHERE estimate_id='{other}';"
    else:
        write = f"UPDATE public.{family} SET estimate_id='{e}' WHERE id='{ref}';"
    delete = f"DELETE FROM public.estimates WHERE id='{e}';"
    setup = f"""BEGIN;
INSERT INTO public.leads(id,title) VALUES('{lead}','__estimate_delete_safeguard_test__');
INSERT INTO public.jobs(id,job_number,name,client_name,site_address,status,created_by)
VALUES('{job}','__guard_{job}','__estimate_delete_safeguard_test__','SYNTHETIC','SYNTHETIC','archived','{user}');
INSERT INTO public.estimates(id,job_name,lead_id,public_token) VALUES
('{e}','__estimate_delete_safeguard_test__','{lead}',NULL),('{other}','__estimate_delete_safeguard_test__','{lead}',NULL);
INSERT INTO public.estimate_lines(id,estimate_id,lead_id,description) VALUES
('{line}','{e}','{lead}','synthetic'),('{other_line}','{other}','{lead}','synthetic');
{ref_insert(other) if mode == 'update' else ''} COMMIT;"""
    futures = []
    try:
        ok(setup)
        winner, loser = (write, delete) if first == 'writer' else (delete, write)
        a = pool.submit(sql, f"BEGIN ISOLATION LEVEL {isolation}; SET LOCAL application_name='{tag}_a'; SET LOCAL lock_timeout='8s'; SET LOCAL statement_timeout='12s'; {winner} SELECT pg_sleep(5); COMMIT;")
        futures.append(a)
        wait_for(f"select exists(select 1 from pg_stat_activity where application_name='{tag}_a' and wait_event='PgSleep') as ready")
        b = pool.submit(sql, f"BEGIN ISOLATION LEVEL {isolation}; SET LOCAL application_name='{tag}_b'; SET LOCAL lock_timeout='8s'; SET LOCAL statement_timeout='12s'; SELECT id FROM public.estimates WHERE id='{other}'; {loser} COMMIT;")
        futures.append(b)
        wait_for(f"select exists(select 1 from pg_stat_activity where application_name='{tag}_b' and cardinality(pg_blocking_pids(pid))>0) as ready")
        ra, rb = a.result(), b.result()
        assert isinstance(ra, list), ra
        assert isinstance(rb, dict) and 'error' in rb and any(code in rb['error'] for code in ['23503', '40001']), rb
        exists = ok(f"select exists(select 1 from public.estimates where id='{e}') as present")[0]['present']
        assert exists == (first == 'writer'), (family, first, exists)
        if family == 'budget_lines':
            target = "imported_estimate_id"; scope = f"job_id='{job}'"
        elif family == 'allowances':
            target = 'estimate_line_id'; scope = f"job_id='{job}'"
        else:
            target = 'estimate_id'; scope = f"estimate_id in ('{e}','{other}')"
        expected = (line if family == 'allowances' else e) if first == 'writer' else ((other_line if family == 'allowances' else other) if mode == 'update' else None)
        refs = ok(f"select {target} as target from public.{family} where {scope}")
        assert refs == ([{'target': expected}] if expected else []), (family, refs, expected)
        print(f'PASS {family} {mode} {first}-first {isolation}: blocked transaction observed; loser rejected; exact records preserved', flush=True)
    finally:
        for future in futures:
            future.result()
        cleanup = 'BEGIN; SET LOCAL lock_timeout=\'8s\';'
        for table in tables:
            scope = f"job_id='{job}'" if table in ['budget_lines', 'allowances'] else f"estimate_id in ('{e}','{other}')"
            cleanup += f'DELETE FROM public.{table} WHERE {scope};'
        cleanup += f"DELETE FROM public.estimates WHERE id in ('{e}','{other}'); DELETE FROM public.jobs WHERE id='{job}'; DELETE FROM public.leads WHERE id='{lead}'; COMMIT;"
        ok(cleanup)
        remaining = ok(f"select (select count(*) from public.estimates where id in ('{e}','{other}'))+(select count(*) from public.jobs where id='{job}')+(select count(*) from public.leads where id='{lead}')+(select count(*) from public.estimate_lines where id in ('{line}','{other_line}')) as remaining")[0]['remaining']
        assert remaining == 0, f'Fixture cleanup incomplete: {e} {other} {job} {lead}'


def main():
    passed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for isolation in ['READ COMMITTED', 'REPEATABLE READ']:
            for family in ['budget_lines', 'allowances', 'fixer_requests', 'chat_messages', 'estimate_proposal_sessions', 'estimate_line_proposals']:
                for mode in ['insert', 'update']:
                    for first in ['writer', 'delete']:
                        run_case(pool, family, mode, first, isolation)
                        passed += 1
    print(f'PASSED {passed}/{passed} real concurrency cases; all synthetic fixtures removed', flush=True)


if __name__ == '__main__':
    main()
