import { apiClient } from "./api-client";
import type { Claim } from "./types";

export interface CreateLineItemInput {
  date: string;
  category: string;
  amount: number;
  description: string;
}

export async function listClaims(): Promise<Claim[]> {
  const res = await apiClient.get<{ claims: Claim[] }>("/claims");
  return res.data.claims;
}

export async function createClaim(lineItems: CreateLineItemInput[]): Promise<Claim> {
  const res = await apiClient.post<{ claim: Claim }>("/claims", { lineItems });
  return res.data.claim;
}
