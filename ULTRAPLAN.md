# JDC Platform: Lead → Completion → Budget Reporting — Workflow Gap Analysis

## The Complete Contractor Workflow (BT parity map)

```
LEAD INTAKE          ESTIMATING          JOB EXECUTION           CLOSEOUT & REPORTING
────────────────────────────────────────────────────────────────────────────────────
Lead captured    →   Estimate built  →   Budget set up      →   Punch list complete
Lead qualified   →   Markup applied  →   Schedule active    →   Final invoice sent
Site visit notes →   Proposal PDF    →   Daily logs / photos→   QB reconciliation
Follow-up log    →   Client signs    →   Tasks / subs       →   Job profitability
CRM pipeline     →   Convert → Job   →   Change orders      →   Portfolio report
                                     →   Bills / actuals    →
                                     →   Progress billing   →
```

---

## What You Have vs. What BT Has

| Stage | BT Capability | JDC Status | Gap |
|-------|--------------|------------|-----|
| **Lead Intake** | Lead pipeline, source tracking, follow-up history | Not built | Entire CRM module |
| **Estimating** | Estimate builder, cost catalog, assemblies | Not built | UI for 4,600-row cost book |
| **Proposal** | PDF + e-signature + link | Not built | Proposal generator + accept flow |
| **Convert → Job** | Estimate becomes budget + schedule | Not built | Conversion bridge |
| **Budget setup** | Phases, cost codes, budget lines | Built (lines + CO) | POs, bills, vendor commitments |
| **Schedule** | Gantt + milestones + subs | Built | Client-visible milestones |
| **Daily logs** | Photos, weather, manpower | Partial | Photo upload missing |
| **Tasks / punch list** | My tasks / all tasks / punch list tab | Built | Punch list status tag |
| **Change orders** | Draft → client approve → PDF | Built (draft→approve) | PDF + client link |
| **Purchase orders** | PO to vendor, linked to budget line | Not built | Full PO workflow |
| **Bills / actuals** | Bill entry, approval, QB sync | Not built | Bill approval chain |
| **Progress billing** | Draw schedule, invoice to client | Not built | Not in roadmap |
| **Job closeout** | Final invoice, warranty status | Not built | Not in roadmap |
| **Job profitability** | Contract vs budget vs actual vs forecast | Not built | Phase 3 |
| **QB sync** | Bills, invoices, payments bidirectional | Stub only | Phase 4 |
| **Portfolio report** | Multi-job budget health | Not built | Phase 8 |

---

## The Three Biggest Gaps for This Workflow

**1. Lead Intake → Estimate → Job (nothing exists)**
BT's killer feature is this funnel. Without it, jobs get created manually with no paper trail from the sale. The 4,600-row cost book is already in the DB — you need the estimate builder UI that reads from it, a proposal PDF, and a one-click "Accept → Create Job + Budget" conversion.

**2. Bills / Purchase Orders / Progress Billing (the money middle)**
You have budget lines and actuals but no way to track *commitments* (POs to subs/vendors) or *billing to the client* (draw schedule). This is the core of job cost control. BT users live here daily.

**3. Job Profitability Report (the finish line)**
The whole workflow is pointless without the closing report: contract value → revised contract (after COs) → budget → committed (POs) → actual (bills paid) → forecast → variance → margin %. This is what the owner reads at job end.

---

## Recommended Build Order (BT parity, fastest path)

### Sprint A — Close the Revenue Loop (Phase 5 first)
1. Lead pipeline view (kanban: New → Contacted → Proposal → Won → Lost)
2. Lead detail: contact info, project notes, status, follow-up log
3. Estimate builder: pulls from cost book, groups by phase, sets markup
4. Proposal PDF generation + "Accept" button → auto-creates job + budget lines
5. Lead source tracking on jobs

### Sprint B — Strengthen Job Cost Control (Phase 3)
6. Purchase orders: create PO → link to budget line → mark committed
7. Bills: enter bill → link to PO or budget line → approval status (pending/approved/paid)
8. Progress billing / draw schedule: client-facing invoice milestones
9. Improved budget summary: Contract / Revised / Budget / Committed / Actual / Forecast / Variance

### Sprint C — Close the Loop on Completion
10. Punch list: task type = "punch" with its own tab/filter (task table already exists)
11. Job closeout status: move from Open → Warranty → Closed with completion checklist
12. Change order PDF + client approval link
13. Job profitability report: the final financial summary per job

### Sprint D — Better Than BT
14. AI receipt extraction: photo → actual cost entry (Claude Vision)
15. AI daily brief: morning summary of every job's status
16. Budget overrun risk alerts
17. Natural language search across jobs

---

## JDC-Specific Advantage to Build Early

The **4,600-row cost book** is already in the DB. BT users build estimates from scratch or import CSVs. Surfacing that cost book in an estimate builder with AI-assisted scope matching ("I need to remodel a 200 sqft bathroom" → Claude pre-populates likely line items with costs from the book) gives JDC something BT doesn't — and it directly converts to a budget on job creation. That's the wedge that makes this platform worth switching to.

---

## Relationship to Existing ROADMAP.md

| Sprint | Maps to ROADMAP Phase |
|--------|-----------------------|
| Sprint A | Phase 5 (Sales, Estimating, Proposals) |
| Sprint B | Phase 3 (Money and Commitments) |
| Sprint C | Phase 3 + Phase 2 (Field OS) |
| Sprint D | Phase 7 (AI Advantage) |

The existing ROADMAP phases remain valid. This document reorders them by **workflow dependency** rather than feature category — you can't meaningfully do Phase 8 reporting without Phase 3 bills/actuals, and Phase 3 actuals are hollow without Phase 5 estimates feeding the original budget.

---

## To Initialize Git (required for remote ultraplan sessions)

```
cd "C:\Users\mapta\Documents\New project\jdc-platform"
git init
git add -A
git commit -m "Initial commit"
```
