# POC: Expense Claims and Reimbursement

**Track:** Finance · **Status:** Required · **Path:** React to Full Stack — 101 (2-week solo POC)
**Stack:** Express or Next.js (engineer's choice) · PostgreSQL · Prisma

## 1. Background

Expense claims arrive as spreadsheets and photographs over email. Nobody can say what stage a
claim is at, approvers see claims they shouldn't, and finance rekeys everything at month end.

You're building the system that fixes this: employees submit itemised claims with receipts,
claims route through approval based on amount, and finance can export what's approved for a
period without touching a spreadsheet.

This POC's centre of gravity is **data integrity and authorization** — a claim total that
can drift from its line items, or an approver who can see claims that aren't theirs, are both
real failures here even if the happy path demos perfectly.

## 2. Actors

| Role | Can do |
|---|---|
| **Claimant** | Submit claims with line items and receipts, view their own claims, edit rejected claims |
| **Approver** | See only claims routed to them, approve or reject with a reason |
| **Finance** | Export approved claims for a period; see claims across all employees (read-only) |

## 3. Functional requirements

### 3.1 Submitting a claim
- A claim has one or more line items (date, category, amount, description) and can have
  receipt attachments per line item or per claim (your choice — document it).
- **The claim total is derived from its line items and must never be independently editable.**
  This is the core hard case of this POC: no code path — including a direct API call — should
  be able to leave a claim with a total that disagrees with the sum of its lines.

### 3.2 Approval routing
- Claims route through an approval chain based on the claim amount (e.g. under a threshold: one
  approver; above it: a second approver). The exact thresholds are yours to define — document
  them.
- An approver sees only the claims currently routed to them, never the full list.
- If the amount changes after routing has started (e.g. a line item edit before the first
  approval), decide what happens to the chain and document the rule.

### 3.3 Rejection and resubmission
- A rejected claim returns to the claimant with the rejection reason attached, editable, and
  resubmittable.
- The rejection reason and history should not be lost when the claim is edited and resubmitted.

### 3.4 Approved claims are locked
- Once a claim is fully approved, it becomes read-only. No further edits to line items,
  amounts, or attachments — through the UI or directly via the API.

### 3.5 Visibility boundaries
- Claimants see only their own claims.
- Approvers see only claims assigned to them (pending) plus, optionally, claims they've
  already decided on.
- Finance sees everything, but read-only — finance cannot approve or reject.

### 3.6 Finance export
- Finance can export all claims approved within a given period (e.g. a date range) in a format
  usable for bookkeeping (CSV is sufficient).
- The export should reflect only genuinely approved claims for that period — an in-flight or
  rejected claim must never appear.

## 4. Data to think through

You choose the exact schema. At minimum, your model needs to represent: employees, claims and
their status, the line items belonging to each claim, and a record of what happened to a claim
over time (submitted, approved, rejected, by whom, when, why) — not just its current state.

The question worth sitting with before you write any code: is the claim total something you
calculate whenever it's needed, or something you store and keep in sync as line items change?
Both are legitimate designs. Pick one, and be ready to defend it — specifically, be ready to
show that your choice cannot drift out of sync with the line items, under any code path.

## 5. How it's exposed

Design the API surface — routes, methods, request/response shapes — however fits the workflow
above. There's no prescribed structure here; the requirements in §3 are the spec, not a
particular set of endpoints.

## 6. Things this POC will specifically be checked for

- Line items need a positive amount, a valid date, and a real category; a claim with zero line
  items shouldn't be submittable at all.
- Trying to edit an already-approved claim, or approving a claim that isn't in your queue,
  should come back as a clear, specific failure — not a silent no-op and not a generic error.
- Every route requires a real, authenticated user.
- This is the sharpest test in this POC: an approver requesting a claim outside their queue,
  directly by its ID, must be refused **at the point of the query** — not merely hidden by the
  UI. Write a test that attempts exactly that.
- The claim total (§3.1) needs to be provably impossible to desynchronise from its line items.
  Write a test that tries to leave it mismatched and confirm it can't.
- The approver queue and the finance export need to support filtering by date range and
  status — neither should mean loading every claim ever into memory.
- Submission, approval, and rejection should each leave a structured trace — this is the audit
  trail finance will actually ask for when a claim is disputed.
- The whole thing should come up with `docker compose up` and no manual setup beyond a
  documented `.env`.

## 7. Walkthrough questions to expect

NOTE: These are indicative questions only. Expect to be asked further questions in a similar
spirit during the walkthrough.

1. How does the approval chain know which approver is next? What if the amount changes
   mid-chain?
2. An approved claim is read-only. Where is that enforced — the UI, the service, or the
   database?
3. Show me a rejected claim returning for edit. What is preserved and what is reset?

## 8. If you finish early (optional)

Don't add new features — deepen what's here:
- Add a second approval tier for claims above a higher threshold and show the routing logic
  handles a variable-length chain without special-casing.
- Add receipt storage via a real object store pattern (even if stubbed locally) with signed
  upload URLs, rather than storing files on local disk.
- Write a load test for the finance export at two years of simulated claim data and show the
  query plan.
