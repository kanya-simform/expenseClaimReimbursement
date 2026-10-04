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

| Role         | Can do                                                                                  |
| ------------ | --------------------------------------------------------------------------------------- |
| **Claimant** | Submit claims with line items and receipts, view their own claims, edit rejected claims |
| **Approver** | See only claims routed to them, approve or reject with a reason                         |
| **Finance**  | Export approved claims for a period; see claims across all employees (read-only)        |

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
- **Frontend:** React (Vite), Tailwind CSS + shadcn/ui (base-ui variant)
- **Attachments:** local disk storage for this POC (an object-store pattern with signed upload
  URLs is an optional stretch goal per the spec, not core scope)
- **Tests:** Jest + Supertest, run against a real Postgres database (not mocked) — see
  `backend/src/__tests__/`

## Repository layout

```
.
├── Kanya - expense-claims-and-reimbursement.md   # the spec
├── CLAUDE.md                                     # guidance for Claude Code instances
├── README.md
├── docker-compose.yml                            # db + migrate + backend + frontend
├── .env.example                                  # copy to .env and fill in before docker compose up
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma                         # data model + design-decision notes
│   │   └── migrations/                           # schema migrations + the integrity triggers
│   ├── prisma.config.ts
│   ├── Dockerfile
│   └── src/
│       ├── routes/ controllers/ services/        # auth, claims, approvals, finance
│       └── __tests__/                            # the two spec-required tests + more
└── frontend/
    ├── Dockerfile
    └── src/
        └── pages/                                # ClaimantDashboard, ApproverQueue, FinanceExport
```

## Getting started

### Docker (recommended — this is the `docker compose up` path spec §6 asks for)

1. `cp .env.example .env` at the repo root and fill in `POSTGRES_PASSWORD` and `JWT_SECRET`
   (`openssl rand -hex 32` for the latter). This is the only setup step.
2. `docker compose up --build`
3. Frontend: `http://localhost:5173` · Backend API: `http://localhost:4000/api`

This brings up Postgres, runs migrations via a one-shot `migrate` service (the `backend`
service waits for it to succeed before starting), then starts the backend and frontend.
Uploaded receipts and the Postgres data both persist in named volumes across
`docker compose down` (not `down -v`).

If you're already running the backend locally via `npm run dev` (below), stop it first —
both bind host port 4000.

### Manual (without Docker)

1. Have a PostgreSQL database available and create a role/database for this project.
2. `cd backend && cp .env.example .env` and fill in `DATABASE_URL`. If the password contains
   special characters (e.g. `@`), percent-encode them (`@` → `%40`).
3. `npm install`
4. `npx prisma migrate dev` to apply migrations (schema + integrity triggers) against your database.
5. `npm run dev` (backend) and, in `frontend/`, `cp .env.example .env` then `npm install && npm run dev`.

### Running the tests

```
cd backend && npm test
```

Runs against the database in your `backend/.env` — there's no separate test database or
mocking of Prisma, since the two hardest requirements (claim-total integrity, query-scoped
approver authorization) are specifically about things a mock can't prove.

## Current status

All of spec §3 (3.1 through 3.6) is implemented: claim submission with itemised line items,
amount-based approval routing, rejection/resubmission with preserved history, approved-claim
immutability (enforced at the database layer, not just the service layer), visibility
boundaries per role, and the finance CSV export. Authentication/authorization, CSV bulk
import, file attachments, filtering + pagination on every listing, and an audit-trail view are
also built. The two tests spec §6 explicitly calls for (query-scoped approver authorization,
claim-total integrity) exist in `backend/src/__tests__/`, along with tests for approved-claim
immutability and authentication-required-on-every-route.
