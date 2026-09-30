import { getPasswordStrength } from "@/lib/password-strength";
import { cn } from "@/lib/utils";

const LABEL_STYLES: Record<string, string> = {
  "Very weak": "text-destructive",
  Weak: "text-amber-600 dark:text-amber-500",
  Strong: "text-blue-600 dark:text-blue-500",
  "Very strong": "text-emerald-600 dark:text-emerald-500",
};

const BAR_STYLES: Record<string, string> = {
  "Very weak": "bg-destructive",
  Weak: "bg-amber-500",
  Strong: "bg-blue-500",
  "Very strong": "bg-emerald-500",
};

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;

  const { score, maxScore, label } = getPasswordStrength(password);
  const segments = 4;
  const filled = Math.max(1, Math.ceil((score / maxScore) * segments));

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-1">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full bg-muted transition-colors",
              i < filled && BAR_STYLES[label],
            )}
          />
        ))}
      </div>
      <p className={cn("text-xs font-medium", LABEL_STYLES[label])}>{label}</p>
    </div>
  );
}
