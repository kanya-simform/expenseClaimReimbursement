import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  categoryLabelFor,
  ClaimHistory,
  formatCurrency,
  StatusBadge,
} from "@/components/claim-display";
import { AppShell } from "@/components/layout/AppShell";
import { LineItemAttachments } from "@/components/LineItemAttachments";
import { PaginationControls } from "@/components/PaginationControls";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { decideOnClaim, listApprovalQueue, viewQueuedAttachment } from "@/lib/approvals-api";
import { useAuth } from "@/lib/auth-context";
import { getErrorMessage } from "@/lib/get-error-message";
import type { Claim } from "@/lib/types";

type View = "pending" | "decided";
type DecidedStatusFilter = "ALL" | "APPROVED" | "REJECTED";

function ApprovalClaimCard({ claim, view }: Readonly<{ claim: Claim; view: View }>) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isRejecting, setIsRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const myStep = claim.approvalSteps?.find((step) => step.approverId === user?.id);

  // A resubmitted or mid-chain-edited claim gets a fresh ApprovalStep chain (see routeClaim
  // in claims.service.ts), which wipes any prior decision from `approvalSteps` — so for the
  // "decided" tab, fall back to the permanent ClaimEvent record of this approver's last
  // decision when the current step doesn't reflect one (e.g. it's back to PENDING).
  const myDecision =
    myStep && myStep.status !== "PENDING"
      ? { status: myStep.status, reason: myStep.reason }
      : [...(claim.events ?? [])]
          .reverse()
          .filter(
            (event) =>
              event.actorId === user?.id &&
              (event.type === "APPROVED" || event.type === "REJECTED"),
          )
          .map((event) => ({ status: event.type, reason: event.reason }))[0];

  const decideMutation = useMutation({
    mutationFn: (input: { action: "APPROVE" | "REJECT"; reason?: string }) =>
      decideOnClaim(claim.id, input.action, input.reason),
    onSuccess: (_claim, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["approvals"] });
      toast.success(variables.action === "APPROVE" ? "Claim approved" : "Claim rejected");
      setIsRejecting(false);
      setReason("");
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err, "Could not record your decision")),
  });

  return (
    <>
      <Card>
        <CardContent className="grid gap-3">
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
            <div className="flex items-center gap-3">
              <span className="font-medium">{formatCurrency(claim.totalAmount)}</span>
              {view === "pending" && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={decideMutation.isPending}
                    onClick={() => decideMutation.mutate({ action: "APPROVE" })}
                  >
                    {decideMutation.isPending && decideMutation.variables?.action === "APPROVE"
                      ? "Approving…"
                      : "Approve"}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="xs"
                    disabled={decideMutation.isPending}
                    onClick={() => setIsRejecting(true)}
                  >
                    Reject
                  </Button>
                </>
              )}
              {view === "decided" && myDecision && (
                <Badge variant={myDecision.status === "REJECTED" ? "destructive" : "secondary"}>
                  You {myDecision.status === "REJECTED" ? "rejected" : "approved"}
                </Badge>
              )}
            </div>
          </div>
          <ul className="grid gap-1.5 text-sm text-muted-foreground">
            {claim.lineItems.map((item) => (
              <li key={item.id} className="grid gap-1">
                <div className="flex items-center justify-between">
                  <span>
                    {new Date(item.date).toLocaleDateString()} · {categoryLabelFor(item)} ·{" "}
                    {item.description}
                  </span>
                  <span>{formatCurrency(item.amount)}</span>
                </div>
                {item.attachments.length > 0 && (
                  <LineItemAttachments
                    claimId={claim.id}
                    lineItemId={item.id}
                    attachments={item.attachments}
                    canModify={false}
                    onView={viewQueuedAttachment}
                  />
                )}
              </li>
            ))}
          </ul>
          {view === "decided" && myDecision?.reason && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Your reason: </span>
              {myDecision.reason}
            </p>
          )}
          {claim.approvalSteps && claim.approvalSteps.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Approval chain:{" "}
              {claim.approvalSteps
                .map(
                  (step) =>
                    `${step.approver.firstName} ${step.approver.lastName} (${step.status.toLowerCase()})`,
                )
                .join(" → ")}
            </p>
          )}
          <ClaimHistory events={claim.events ?? []} />
        </CardContent>
      </Card>

      <AlertDialog
        open={isRejecting}
        onOpenChange={(open) => {
          if (!open && decideMutation.isPending) return;
          setIsRejecting(open);
          if (!open) setReason("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this claim?</AlertDialogTitle>
            <AlertDialogDescription>
              The claimant will see this reason and can edit and resubmit the claim.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is this claim being rejected?"
              disabled={decideMutation.isPending}
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={decideMutation.isPending}
              onClick={() => setIsRejecting(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={decideMutation.isPending || !reason.trim()}
              onClick={() => decideMutation.mutate({ action: "REJECT", reason: reason.trim() })}
            >
              {decideMutation.isPending ? "Rejecting…" : "Reject claim"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ApproverQueue() {
  const { user } = useAuth();
  const [view, setView] = useState<View>("pending");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [decidedStatus, setDecidedStatus] = useState<DecidedStatusFilter>("ALL");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  function handleViewChange(value: View) {
    setView(value);
    setPage(1);
  }

  function handleDecidedStatusChange(value: DecidedStatusFilter) {
    setDecidedStatus(value);
    setPage(1);
  }

  const { data, isLoading } = useQuery({
    queryKey: ["approvals", { view, search: debouncedSearch, decidedStatus, page }],
    queryFn: () =>
      listApprovalQueue({
        decided: view === "decided",
        status: view === "decided" && decidedStatus !== "ALL" ? decidedStatus : undefined,
        search: debouncedSearch || undefined,
        page,
      }),
  });

  const claims = data?.claims ?? [];
  const hasFilters = debouncedSearch !== "" || decidedStatus !== "ALL";

  return (
    <AppShell>
      <div className="grid gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Approval queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back, {user?.firstName}. Claims routed to you show up here.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={view === "pending" ? "default" : "outline"}
            size="sm"
            onClick={() => handleViewChange("pending")}
          >
            Pending
          </Button>
          <Button
            type="button"
            variant={view === "decided" ? "default" : "outline"}
            size="sm"
            onClick={() => handleViewChange("decided")}
          >
            Decided
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search claimant or description…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-xs"
          />
          {view === "decided" && (
            <Select
              value={decidedStatus}
              onValueChange={(value) => handleDecidedStatusChange(value as DecidedStatusFilter)}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!isLoading && claims.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {hasFilters
              ? "No claims match your filters."
              : view === "pending"
                ? "No claims are currently routed to you."
                : "You haven't decided on any claims yet."}
          </p>
        )}

        <div className="grid gap-3">
          {claims.map((claim) => (
            <ApprovalClaimCard key={claim.id} claim={claim} view={view} />
          ))}
        </div>

        {data?.pagination && (
          <PaginationControls pagination={data.pagination} onPageChange={setPage} />
        )}
      </div>
    </AppShell>
  );
}
