export type Role = "CLAIMANT" | "APPROVER" | "FINANCE";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
}

export type ClaimStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";

export interface Attachment {
  id: string;
  lineItemId: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface LineItem {
  id: string;
  date: string;
  category: string;
  customCategory: string | null;
  amount: string;
  description: string;
  attachments: Attachment[];
}

export interface Claim {
  id: string;
  status: ClaimStatus;
  totalAmount: string;
  currentStep: number;
  createdAt: string;
  updatedAt: string;
  lineItems: LineItem[];
}
