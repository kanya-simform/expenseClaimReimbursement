// Mirrors frontend/src/lib/password-strength.ts's scoring — kept in sync by hand since the
// two apps are separate packages. Enforced here too so a direct API call can't bypass the
// frontend's strength meter and register a weak password.
const MIN_ACCEPTABLE_SCORE = 3;

function scorePassword(password: string): number {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  return score;
}

export function isPasswordStrongEnough(password: string): boolean {
  return scorePassword(password) >= MIN_ACCEPTABLE_SCORE;
}
