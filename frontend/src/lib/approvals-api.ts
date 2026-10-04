import { apiClient } from "./api-client";
import type { Claim, Pagination } from "./types";

export interface QueueFilters {
  decided?: boolean;
  status?: "APPROVED" | "REJECTED";
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listApprovalQueue(
  filters: QueueFilters = {},
): Promise<{ claims: Claim[]; pagination: Pagination }> {
  const params: Record<string, string | number> = {};
  if (filters.decided) params.decided = "true";
  if (filters.status) params.status = filters.status;
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.search) params.search = filters.search;
  if (filters.page) params.page = filters.page;
  if (filters.pageSize) params.pageSize = filters.pageSize;

  const res = await apiClient.get<{ claims: Claim[]; pagination: Pagination }>("/approvals", {
    params,
  });
  return res.data;
}

export async function getQueuedClaim(claimId: string): Promise<Claim> {
  const res = await apiClient.get<{ claim: Claim }>(`/approvals/${claimId}`);
  return res.data.claim;
}

export async function decideOnClaim(
  claimId: string,
  action: "APPROVE" | "REJECT",
  reason?: string,
): Promise<Claim> {
  const res = await apiClient.post<{ claim: Claim }>(`/approvals/${claimId}/decision`, {
    action,
    reason,
  });
  return res.data.claim;
}

export async function viewQueuedAttachment(
  claimId: string,
  lineItemId: string,
  attachmentId: string,
): Promise<Blob> {
  const res = await apiClient.get(
    `/approvals/${claimId}/line-items/${lineItemId}/attachments/${attachmentId}`,
    { responseType: "blob" },
  );
  return res.data;
}
