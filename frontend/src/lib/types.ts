export type Role = "CLAIMANT" | "APPROVER" | "FINANCE";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
}

export type ClaimStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

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

export type ApprovalStepStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ApprovalStep {
  id: string;
  sequence: number;
  approverId: string;
  status: ApprovalStepStatus;
  reason: string | null;
  decidedAt: string | null;
  approver: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export type ClaimEventType = "SUBMITTED" | "APPROVED" | "REJECTED" | "RESUBMITTED" | "EDITED";

export interface ClaimEvent {
  id: string;
  type: ClaimEventType;
  actorId: string;
  reason: string | null;
  createdAt: string;
  actor: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface Claim {
  id: string;
  status: ClaimStatus;
  totalAmount: string;
  currentStep: number;
  createdAt: string;
  updatedAt: string;
  lineItems: LineItem[];
  claimant?: Pick<User, "id" | "firstName" | "lastName" | "email">;
  approvalSteps?: ApprovalStep[];
  events?: ClaimEvent[];
}
