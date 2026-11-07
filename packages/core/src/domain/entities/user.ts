export interface User {
  id: string;
  email: string;
  passwordHash: string;
  tenantId: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
}
