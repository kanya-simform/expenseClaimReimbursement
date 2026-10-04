// Amount-based routing (spec §3.2): claims under this total get a single approver (the
// claimant's manager); claims at or above it also require their manager's manager. The
// threshold is an arbitrary POC choice, not derived from any business rule.
export const SECOND_TIER_THRESHOLD = 500;
