import { useMutation, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { categoryLabelFor, formatCurrency, StatusBadge } from "@/components/claim-display";
import { AppShell } from "@/components/layout/AppShell";
import { PaginationControls } from "@/components/PaginationControls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { exportClaimsCsv, listFinanceClaims } from "@/lib/finance-api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { ClaimStatus } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";

const STATUS_FILTER_LABEL: Record<ClaimStatus, string> = {
  DRAFT: "Draft",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

function ExportCard() {
  const [status, setStatus] = useState<ClaimStatus>("APPROVED");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Mirrors the backend's own check (finance.service.ts's getClaimsForExport) so the user
  // sees this immediately instead of round-tripping to the server to find out.
  const dateRangeError = from && to && from > to ? "'From' must be on or before 'to'" : null;

  const mutation = useMutation({
    mutationFn: () => exportClaimsCsv(status, from, to),
    onSuccess: () => {
      setError(null);
      toast.success("Export downloaded");
    },
    onError: (err: unknown) => setError(getErrorMessage(err, "Could not export claims")),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export claims</CardTitle>
        <CardDescription>
          Downloads a CSV for the chosen status within the period — one row per line item. Defaults
          to Approved, since that's what finance exports for bookkeeping; a rejected or in-flight
          claim never appears unless you pick that status yourself.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="export-status">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as ClaimStatus)}>
              <SelectTrigger id="export-status" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["APPROVED", "PENDING", "REJECTED"] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {STATUS_FILTER_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="export-from">From</Label>
            <Input
              id="export-from"
              type="date"
              value={from}
              max={to || undefined}
              aria-invalid={!!dateRangeError}
              onChange={(event) => {
                setFrom(event.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="export-to">To</Label>
            <Input
              id="export-to"
              type="date"
              value={to}
              min={from || undefined}
              aria-invalid={!!dateRangeError}
              onChange={(event) => {
                setTo(event.target.value);
                setError(null);
              }}
            />
          </div>
          <Button
            type="button"
            disabled={!from || !to || !!dateRangeError || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <Download className="size-4" />
            {mutation.isPending ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
        {dateRangeError && <p className="text-sm text-destructive">{dateRangeError}</p>}
      </CardContent>
    </Card>
  );
}

function ClaimsBrowser() {
  const [status, setStatus] = useState<ClaimStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["finance-claims", { status, page }],
    queryFn: () =>
      listFinanceClaims({
        status: status === "ALL" ? undefined : status,
        page,
      }),
  });

  function handleStatusChange(value: ClaimStatus | "ALL") {
    setStatus(value);
    setPage(1);
  }

  const claims = data?.claims ?? [];

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">All claims</h2>
        <Select
          value={status}
          onValueChange={(value) => handleStatusChange(value as ClaimStatus | "ALL")}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {(["PENDING", "APPROVED", "REJECTED"] as const).map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_FILTER_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading claims…</p>}

      {!isLoading && claims.length === 0 && (
        <p className="text-sm text-muted-foreground">No claims match this filter.</p>
      )}

      <div className="grid gap-3">
        {claims.map((claim) => (
          <Card key={claim.id}>
            <CardContent className="grid gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusBadge status={claim.status} />
                  <span className="text-sm text-muted-foreground">
                    {claim.claimant
                      ? `${claim.claimant.firstName} ${claim.claimant.lastName}`
                      : "Unknown claimant"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    · {new Date(claim.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <span className="font-medium">{formatCurrency(claim.totalAmount)}</span>
              </div>
              <ul className="grid gap-1 text-sm text-muted-foreground">
                {claim.lineItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between">
                    <span>
                      {new Date(item.date).toLocaleDateString()} · {categoryLabelFor(item)} ·{" "}
                      {item.description}
                    </span>
                    <span>{formatCurrency(item.amount)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {data?.pagination && (
        <PaginationControls pagination={data.pagination} onPageChange={setPage} />
      )}
    </div>
  );
}

export function FinanceExport() {
  const { user } = useAuth();

  return (
    <AppShell>
      <div className="grid gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back, {user?.firstName}. View every claim and export what's approved.
          </p>
        </div>
        <ExportCard />
        <ClaimsBrowser />
      </div>
    </AppShell>
  );
}
