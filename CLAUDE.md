# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

POC: expense claim submission with itemised line items, amount-based approval
routing, rejection/resubmission, and a finance export. Full requirements are in
`Kanya - expense-claims-and-reimbursement.md` at the repo root — read it before making product
decisions, since several requirements (total-integrity, query-scoped authorization) are graded
explicitly and are easy to satisfy shallowly without actually meeting the bar.

Stack: Express (backend) + React/Vite (frontend, not yet scaffolded) + PostgreSQL + Prisma.

## Repository layout

- `backend/` — Express API + Prisma schema/migrations. Currently the only part of the stack that
  exists; no Express app code has been written yet, only the data layer.
- `frontend/` — not yet scaffolded.

## Commands (backend)

Run from `backend/`:

- `npm install` — install dependencies
- `npx prisma migrate dev --name <name>` — create and apply a new migration from schema changes
- `npx prisma migrate dev --create-only --name <name>` — create an empty migration to hand-edit
  (used for raw-SQL work like triggers — see below)
- `npx prisma generate` — regenerate the Prisma Client into `backend/generated/prisma`
- `npx prisma validate` / `npx prisma format` — validate/format `schema.prisma`
- `npx prisma studio` — browse the database

No lint, build, or test scripts are configured yet in `backend/package.json` — the `test` script
is still the npm-init placeholder.

## Database access

`DATABASE_URL` lives in `backend/.env` (gitignored, not committed). It points at a local Postgres
role/database created manually on this machine — there is no `docker-compose.yml` yet, so the
POC's `docker compose up` requirement (spec §6) is not yet satisfied. When containerizing, the
Postgres role's password contains a literal `@`, which must stay percent-encoded (`%40`) in any
connection URL.

## Architecture

### Prisma version is pinned, not latest

`prisma` / `@prisma/client` are pinned to `6.19.3` in `package.json`, not the `latest` npm
dist-tag (which resolves to an `8.0.0-rc.*` release candidate with a materially different CLI —
e.g. `prisma init` no longer scaffolds `schema.prisma` the classic way). Do not run
`npm install prisma@latest` / `@prisma/client@latest` without deliberately deciding to move to
that RC line; it will break `prisma.config.ts` compatibility and the migration workflow described
here.

`package.json` also carries an `overrides` block pinning `deepmerge-ts` and `mysql2` to patched
versions — these are transitive dependencies of `@prisma/config` (Prisma bundles driver-adapter
support for every database it supports, MySQL included, regardless of which one a project
actually uses), not something this project depends on directly. They exist purely to close
`npm audit` high-severity findings; don't add `mysql2` as a real dependency or "simplify" these
away.

The generated Prisma Client outputs to `backend/generated/prisma` (a custom `output` path set in
`schema.prisma`'s `generator` block), not the default `node_modules/@prisma/client` location —
import from the generated path, not from `@prisma/client` directly.

### The data-integrity invariants live in raw SQL, not in `schema.prisma`

This is the most important thing to know before touching the schema. `schema.prisma`
(`backend/prisma/schema.prisma`) only describes tables/columns/relations. The two hard invariants
the whole POC is graded on are enforced by hand-written Postgres trigger functions in
`backend/prisma/migrations/20260921080405_add_claim_integrity_triggers/migration.sql`:

1. **`claims.total_amount` can never desync from its `line_items`.** A `BEFORE INSERT OR UPDATE`
   trigger on `claims` (`claims_before_write()`) recomputes `total_amount` from `line_items` on
   every write and overwrites whatever value the caller supplied — including a raw SQL
   `UPDATE claims SET total_amount = ...`. A trigger on `line_items`
   (`sync_claim_total_on_line_item_change()`) forces the parent claim row to be rewritten on every
   line-item insert/update/delete, which re-enters the same recompute. This was verified live
   against Postgres (seeded data, attempted a direct desyncing `UPDATE`, confirmed it was
   silently corrected back to the true sum) — see conversation history for the transcript if that
   needs re-verifying after a schema change.
2. **An `APPROVED` claim and everything under it is immutable.** `claims_before_write()` also
   rejects (`RAISE EXCEPTION`) any `UPDATE` where `OLD.status = 'APPROVED'`.
   `assert_line_item_claim_editable()` and `assert_attachment_claim_editable()` reject any
   insert/update/delete on `line_items` / `attachments` whose parent claim is `APPROVED`.

Consequences for future schema changes:

- `prisma migrate dev`'s diffing is model-based and knows nothing about these trigger objects.
  Adding a column or relation via a normal schema-driven migration is safe (triggers are untouched
  since they live in their own already-applied migration), but do **not** edit
  `20260921080405_add_claim_integrity_triggers/migration.sql` after the fact — Prisma migrations
  are append-only. Any change to trigger logic needs a new migration (create it with
  `--create-only`, write the `CREATE OR REPLACE FUNCTION ...` there).
- Prisma fields are `@map`'d to `snake_case` column/table names specifically so this raw SQL reads
  cleanly (`claim_id`, `total_amount`, table `claims`/`line_items`/`attachments`, etc.) — the
  camelCase Prisma field names do not exist in the actual Postgres schema.
- Application/service code should still validate before hitting the DB (for clean, specific error
  messages per spec §6), but must never assume it's the only thing enforcing these two rules — the
  DB triggers are the actual source of truth and will reject a bad write even if a service-layer
  check is skipped or buggy.

### Domain model

Defined in `backend/prisma/schema.prisma`:

- `User` (role: `CLAIMANT` / `APPROVER` / `FINANCE`, optional `managerId` self-relation)
- `Claim` (status: `DRAFT` / `PENDING` / `APPROVED` / `REJECTED`; `totalAmount` — see above)
- `LineItem` (belongs to a `Claim`)
- `Attachment` (belongs to a `LineItem` — **not** to a `Claim` directly; a deliberate choice
  documented at the top of `schema.prisma`, since the spec left this open)
- `ApprovalStep` (belongs to a `Claim`; models the approval chain as an ordered sequence of
  approver decisions rather than a single "next approver" field — this is what should back both
  "who's in an approver's queue" and the audit-relevant approval history)
- `ClaimEvent` (belongs to a `Claim`; append-only audit trail — submitted/approved/rejected/
  resubmitted/edited — separate from `ApprovalStep` so history survives resubmission cycles)

None of the routing/rejection/resubmission/visibility-boundary logic (spec §3.2–§3.5) is
implemented yet — only the schema and the two DB-level integrity guarantees above exist so far.

## Housekeeping notes

- `backend/` has its own `.git` (uninitialized, no commits) and an empty `backend/CLAUDE.md` —
  both were scaffolded incidentally by an earlier `prisma init` attempt on the RC CLI, not set up
  deliberately. Decide on a single repo root (likely the project root, not `backend/`) before
  making the first commit.
