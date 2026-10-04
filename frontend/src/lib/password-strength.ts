export type PasswordStrengthLabel = "Very weak" | "Weak" | "Strong" | "Very strong";

export interface PasswordStrength {
  score: number;
  maxScore: number;
  label: PasswordStrengthLabel;
}

const MAX_SCORE = 5;

export function getPasswordStrength(password: string): PasswordStrength {
  let score = 0;

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;

  let label: PasswordStrengthLabel;
  if (score <= 1) label = "Very weak";
  else if (score === 2) label = "Weak";
  else if (score <= 4) label = "Strong";
  else label = "Very strong";

  return { score, maxScore: MAX_SCORE, label };
}
