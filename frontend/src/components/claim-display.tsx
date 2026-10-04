import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABEL } from "@/lib/categories";
import type { ClaimStatus, LineItem } from "@/lib/types";

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
