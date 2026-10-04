import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/lib/auth-context";

export function ApproverQueue() {
  const { user } = useAuth();

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Approval queue</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Welcome back, {user?.firstName}. Your pending claims will show up here.
      </p>
    </AppShell>
  );
}
