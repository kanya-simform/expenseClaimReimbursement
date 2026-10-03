import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABEL } from "@/lib/categories";
import type { ClaimEvent, ClaimEventType, ClaimStatus, LineItem } from "@/lib/types";

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  DRAFT: "Draft",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export function StatusBadge({ status }: Readonly<{ status: ClaimStatus }>) {
  if (status === "APPROVED") {
    return <Badge className="bg-emerald-600 text-white">{STATUS_LABEL[status]}</Badge>;
  }
  if (status === "REJECTED") {
    return <Badge variant="destructive">{STATUS_LABEL[status]}</Badge>;
  }
  if (status === "PENDING") {
    return <Badge variant="secondary">{STATUS_LABEL[status]}</Badge>;
  }
  return <Badge variant="outline">{STATUS_LABEL[status]}</Badge>;
}

export function formatCurrency(value: string) {
  return `$${Number(value).toFixed(2)}`;
}

export function categoryLabelFor(item: Pick<LineItem, "category" | "customCategory">) {
  if (item.category === "OTHER" && item.customCategory) {
    return item.customCategory;
  }
  return CATEGORY_LABEL[item.category as keyof typeof CATEGORY_LABEL] ?? item.category;
}

const EVENT_VERB: Record<ClaimEventType, string> = {
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
  RESUBMITTED: "resubmitted",
  EDITED: "edited",
};

// Spec §6: "submission, approval, and rejection should each leave a structured trace — this
// is the audit trail finance will actually ask for when a claim is disputed." The data
// (ClaimEvent rows) exists regardless of whether this renders; this is just the one place
// that actually surfaces it to a human, shared across the claimant/approver/finance views.
export function ClaimHistory({ events }: Readonly<{ events: ClaimEvent[] }>) {
  if (events.length === 0) return null;

  return (
    <div className="grid gap-1">
      <p className="text-xs font-medium text-muted-foreground">History</p>
      <ul className="grid gap-0.5 text-xs text-muted-foreground">
        {events.map((event) => (
          <li key={event.id}>
            <span className="text-foreground">
              {event.actor.firstName} {event.actor.lastName}
            </span>{" "}
            {EVENT_VERB[event.type]} this claim · {new Date(event.createdAt).toLocaleString()}
            {event.reason && <> — "{event.reason}"</>}
          </li>
        ))}
      </ul>
    </div>
  );
}
