import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/lib/auth-context";

export function ClaimantDashboard() {
  const { user } = useAuth();

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">My claims</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Welcome back, {user?.firstName}. Claim submission is coming soon.
      </p>
    </AppShell>
  );
}
