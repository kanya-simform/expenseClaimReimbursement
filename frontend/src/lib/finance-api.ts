import { apiClient } from "./api-client";
import type { Claim, ClaimStatus, Pagination } from "./types";

export interface ListFinanceClaimsFilters {
  status?: ClaimStatus;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listFinanceClaims(
  filters: ListFinanceClaimsFilters = {},
): Promise<{ claims: Claim[]; pagination: Pagination }> {
  const res = await apiClient.get<{ claims: Claim[]; pagination: Pagination }>("/finance/claims", {
    params: filters,
  });
  return res.data;
}

export async function exportApprovedClaimsCsv(from: string, to: string): Promise<void> {
  const res = await apiClient.get("/finance/export", {
    params: { from, to },
    responseType: "blob",
  });

  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `approved-claims-${from}-to-${to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
