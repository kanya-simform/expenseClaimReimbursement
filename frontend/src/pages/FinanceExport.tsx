import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/lib/auth-context";

export function FinanceExport() {
  const { user } = useAuth();

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Finance export</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Welcome back, {user?.firstName}. Approved-claim export is coming soon.
      </p>
    </AppShell>
  );
}
