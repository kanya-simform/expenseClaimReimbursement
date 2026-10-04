# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

POC: expense claim submission with itemised line items, amount-based approval
routing, rejection/resubmission, and a finance export. Full requirements are in
`Kanya - expense-claims-and-reimbursement.md` at the repo root — read it before making product
decisions, since several requirements (total-integrity, query-scoped authorization) are graded
explicitly and are easy to satisfy shallowly without actually meeting the bar.

Stack: Express (backend) + React/Vite (frontend) + PostgreSQL + Prisma.

## Repository layout

- `backend/` — Express API + Prisma schema/migrations. All of spec §3 is implemented: auth,
  claim submission/editing, approval routing, rejection/resubmission, finance export. Tests
  live in `backend/src/__tests__/` (Jest + Supertest, run against a real Postgres database).
- `frontend/` — React (Vite) + Tailwind + shadcn/ui (base-ui variant). Three role-scoped
  dashboards: `ClaimantDashboard`, `ApproverQueue`, `FinanceExport`.
- `docker-compose.yml` (repo root) — `db` + a one-shot `migrate` service + `backend` + `frontend`.
  See README.md's "Getting started" for the two-step `docker compose up` path.

## Commands (backend)

Run from `backend/`:

- `npm install` — install dependencies
- `npx prisma migrate dev --name <name>` — create and apply a new migration from schema changes
- `npx prisma migrate dev --create-only --name <name>` — create an empty migration to hand-edit
  (used for raw-SQL work like triggers — see below)
- `npx prisma generate` — regenerate the Prisma Client into `backend/generated/prisma`
- `npx prisma validate` / `npx prisma format` — validate/format `schema.prisma`
- `npx prisma studio` — browse the database
- `npm run lint` — oxlint
- `npm run build` — writes `generated/prisma/package.json` (`{"type":"module"}`), then `tsc`,
  then `postbuild` copies that marker plus the generated Prisma client's native query engine
  binary into `dist/` and strips `dist/src/__tests__` (test files get compiled into `dist/` too
  since `tsconfig.json` now includes them for type-checking — see below — but they're not meant
  to ship). **The `package.json` marker is load-bearing, not cosmetic** — without it, `tsc`
  (whose `module: "nodenext"` setting decides CJS-vs-ESM output per file based on the nearest
  `package.json`'s `"type"`) compiles `generated/prisma/client.ts` as a broken CJS/ESM hybrid:
  CJS-style `exports.x = ...` assignments alongside the untouched `import.meta.url` token (no
  CJS equivalent exists for it), which is invalid syntax under either module system. This was
  found by actually running `node dist/src/index.js` (the compiled output) while testing the
  Docker setup — `npm run build` reporting success only means `tsc` didn't error, which was
  true even with this bug present; it says nothing about whether the compiled output can
  execute. `npm run dev` (`tsx`) never hit this because `tsx` handles mixed CJS/ESM
  transparently, unlike plain `node` or Jest's default module system.
- `npm test` — Jest + Supertest. Must run via
  `node --experimental-vm-modules node_modules/jest/bin/jest.js` (already wired up as the `test`
  script) because the generated Prisma client (the `prisma-client` generator) is genuinely
  ESM-only — it uses `import.meta.url` to resolve `__dirname`, which has no CommonJS
  equivalent. `tsx` papers over this for `npm run dev`; Jest's default CJS module system can't,
  hence `jest.config.js`'s `useESM`/`extensionsToTreatAsEsm`/`moduleNameMapper` setup. Runs
  against the real database in `backend/.env` — no mocking, no separate test DB; the two
  requirements these tests exist for (claim-total integrity, query-scoped approver
  authorization) are specifically things a mocked Prisma client can't prove.

## Database access

Two paths, both documented in the root README.md:

- **Docker** (`docker compose up` from the repo root, after `cp .env.example .env` and filling
  in `POSTGRES_PASSWORD`/`JWT_SECRET`): a fresh Postgres container this stack owns. Its
  credentials are whatever you put in the root `.env` — pick ones without a literal `@` to
  avoid the percent-encoding issue below entirely.
- **Manual / local dev** (`npm run dev`): `DATABASE_URL` lives in `backend/.env` (gitignored,
  not committed), pointing at a Postgres role/database created manually on this machine. That
  role's password contains a literal `@`, which must stay percent-encoded (`%40`) in the
  connection URL — this is specific to the manually-created local role, not the Docker setup.

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

Routing/rejection/resubmission/visibility-boundary logic (spec §3.2–§3.5) is implemented —
`backend/src/services/approval-routing.ts` (manager-chain routing, documented threshold),
`claims.service.ts` (submission/editing, chain reset on a mid-chain edit or resubmission),
`approvals.service.ts` (the approver queue, decisions, and the query-scoped authorization the
spec calls "the sharpest test in this POC").
