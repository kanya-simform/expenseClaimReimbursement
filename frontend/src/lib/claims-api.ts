import { apiClient } from "./api-client";
import type { Attachment, Claim } from "./types";

export interface LineItemInput {
  id?: string;
  date: string;
  category: string;
  customCategory?: string;
  amount: number;
  description: string;
}

export async function listClaims(): Promise<Claim[]> {
  const res = await apiClient.get<{ claims: Claim[] }>("/claims");
  return res.data.claims;
}

export async function createClaim(lineItems: LineItemInput[]): Promise<Claim> {
  const res = await apiClient.post<{ claim: Claim }>("/claims", { lineItems });
  return res.data.claim;
}

export async function updateClaim(claimId: string, lineItems: LineItemInput[]): Promise<Claim> {
  const res = await apiClient.put<{ claim: Claim }>(`/claims/${claimId}`, { lineItems });
  return res.data.claim;
}

export async function deleteClaim(claimId: string): Promise<void> {
  await apiClient.delete(`/claims/${claimId}`);
}

export async function importClaimCsv(file: File, receipts: File[] = []): Promise<Claim> {
  const formData = new FormData();
  formData.append("file", file);
  receipts.forEach((receipt) => formData.append("receipts", receipt));
  const res = await apiClient.post<{ claim: Claim }>("/claims/import", formData);
  return res.data.claim;
}

export async function uploadAttachment(
  claimId: string,
  lineItemId: string,
  file: File,
): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiClient.post<{ attachment: Attachment }>(
    `/claims/${claimId}/line-items/${lineItemId}/attachments`,
    formData,
  );
  return res.data.attachment;
}

export async function deleteAttachment(
  claimId: string,
  lineItemId: string,
  attachmentId: string,
): Promise<void> {
  await apiClient.delete(`/claims/${claimId}/line-items/${lineItemId}/attachments/${attachmentId}`);
}

export async function viewAttachment(
  claimId: string,
  lineItemId: string,
  attachmentId: string,
): Promise<Blob> {
  const res = await apiClient.get(
    `/claims/${claimId}/line-items/${lineItemId}/attachments/${attachmentId}`,
    { responseType: "blob" },
  );
  return res.data;
}
