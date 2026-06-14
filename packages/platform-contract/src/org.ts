export interface EnterpriseDto {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'disabled';
}

export interface DepartmentDto {
  id: string;
  enterpriseId: string;
  name: string;
  code: string;
  parentId?: string;
  managerUserId?: string;
  sortOrder: number;
  status: 'active' | 'disabled';
}

export interface CreateDepartmentInput {
  enterpriseId: string;
  name: string;
  code: string;
  parentId?: string;
  managerUserId?: string;
  sortOrder?: number;
}

export interface PlatformOrgPort {
  /**
   * Resolve the manager of the user's active department in the authenticated enterprise.
   * Missing users, cross-enterprise users, inactive users/departments, and departments
   * without managers all collapse to an empty result to avoid existence leakage.
   */
  resolveDepartmentManager(
    enterpriseId: string,
    userId: string,
  ): Promise<{ managerUserId?: string }>;

  /**
   * Resolve active user ids holding a role code in the authenticated enterprise.
   * This process-internal port intentionally returns only ids, never profile fields.
   */
  listUserIdsByRole(enterpriseId: string, roleCode: string): Promise<string[]>;
}

export const PLATFORM_ORG_PORT = Symbol.for('PLATFORM_ORG_PORT');
