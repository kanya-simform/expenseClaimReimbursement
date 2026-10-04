export type Role = "CLAIMANT" | "APPROVER" | "FINANCE";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
}
