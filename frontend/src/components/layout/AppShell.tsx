import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";

const ROLE_LABEL: Record<string, string> = {
  CLAIMANT: "Claimant",
  APPROVER: "Approver",
  FINANCE: "Finance",
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold tracking-tight">Expense Claims</span>
            {user && (
              <Badge variant="secondary">{ROLE_LABEL[user.role] ?? user.role}</Badge>
            )}
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {user.firstName} {user.lastName}
              </span>
              <Separator orientation="vertical" className="h-5" />
              <Button variant="ghost" size="sm" onClick={logout}>
                Log out
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
