# Expense Claims and Reimbursement

A POC expense claim submission and approval system: employees submit itemised claims with
receipts, claims route through approval based on amount, and finance can export what's approved
for a period without touching a spreadsheet.

Full requirements: [`Kanya - expense-claims-and-reimbursement.md`](./Kanya%20-%20expense-claims-and-reimbursement.md).

## Background

Expense claims currently arrive as spreadsheets and photographs over email. Nobody can say what
stage a claim is at, approvers see claims they shouldn't, and finance rekeys everything at month
end. This project fixes that.

The centre of gravity here is **data integrity and authorization** — a claim total that can drift
from its line items, or an approver who can see claims that aren't theirs, are real failures even
if the happy path demos perfectly.

## Actors

| Role | Can do |
|---|---|
| **Claimant** | Submit claims with line items and receipts, view their own claims, edit rejected claims |
| **Approver** | See only claims routed to them, approve or reject with a reason |
| **Finance** | Export approved claims for a period; see claims across all employees (read-only) |

## Core requirements

- A claim has one or more line items (date, category, amount, description). A claim total is
  derived from its line items and can never be independently set — no code path, including a
  direct API call, can leave it disagreeing with the sum of its lines.
- Claims route through an approval chain based on amount.
- A rejected claim returns to the claimant, editable and resubmittable, with the rejection reason
  and prior history preserved.
- Once fully approved, a claim becomes read-only — no further edits to line items, amounts, or
  attachments, through the UI or the API.
- Claimants see only their own claims; approvers see only claims routed to them; finance sees
  everything, read-only.
- Finance can export approved claims for a date range as CSV.

## Design decisions

These were left open by the spec and decided here — see `backend/prisma/schema.prisma` for the
enforcement:

- **Attachments belong to a line item**, not the claim as a whole (itemised receipts, not a bag of
  files attached to the claim).
- **`totalAmount` is a stored column, enforced by database triggers**, not computed on every read
  and not trusted from application code. Postgres triggers recompute it from line items on every
  write and silently overwrite any client-supplied value — including a raw SQL `UPDATE` that
  bypasses the application entirely. See
  `backend/prisma/migrations/20260921080405_add_claim_integrity_triggers/migration.sql`.
- **The approval chain is modelled as an ordered sequence of `ApprovalStep` rows** per claim
  (rather than a single "next approver" field), so the approver queue and the approval history
  both fall out of the same table.
- **Approved-claim immutability is enforced at the database layer**, not just the service layer —
  triggers reject any write to an approved claim's line items or attachments, even via direct SQL.

## Tech stack

- **Backend:** Express, PostgreSQL, Prisma (pinned to `6.19.3` — see `CLAUDE.md` for why)
- **Frontend:** React (Vite), Tailwind CSS + shadcn/ui — not yet scaffolded
- **Attachments:** local disk storage for this POC (an object-store pattern with signed upload
  URLs is an optional stretch goal per the spec, not core scope)

## Repository layout

```
.
├── Kanya - expense-claims-and-reimbursement.md   # the spec
├── CLAUDE.md                                     # guidance for Claude Code instances
├── README.md
└── backend/
    ├── prisma/
    │   ├── schema.prisma                         # data model + design-decision notes
    │   └── migrations/                           # schema migrations + the integrity triggers
    ├── prisma.config.ts
    └── .env.example                              # copy to .env and fill in DATABASE_URL
```

`frontend/` does not exist yet.

## Getting started

There is no `docker-compose.yml` yet — the spec's "`docker compose up` and no manual setup beyond
a documented `.env`" requirement (§6) is not yet satisfied. For now, backend setup is manual:

1. Have a PostgreSQL database available and create a role/database for this project.
2. `cd backend && cp .env.example .env` and fill in `DATABASE_URL`. If the password contains
   special characters (e.g. `@`), percent-encode them (`@` → `%40`).
3. `npm install`
4. `npx prisma migrate dev` to apply migrations (schema + integrity triggers) against your database.

## Current status

Only the Prisma data model and its database-level integrity guarantees exist so far (verified
live against Postgres — total-sync and approved-claim locking both hold under direct SQL
tampering, not just through application code). No Express routes, authentication, approval
routing, rejection/resubmission flow, finance export, or frontend have been built yet.
