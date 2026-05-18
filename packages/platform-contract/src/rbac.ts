export type DataScope = 'self' | 'department' | 'department_tree' | 'company' | 'custom';

export interface PermissionDto {
  code: string;
  name: string;
  moduleName: string;
  description?: string;
}

export interface RoleDto {
  id: string;
  enterpriseId: string;
  code: string;
  name: string;
  description?: string;
  permissionCodes: string[];
  dataScope: DataScope;
  status: 'active' | 'disabled';
}

export interface CreateRoleInput {
  enterpriseId: string;
  code: string;
  name: string;
  description?: string;
  permissionCodes: string[];
  dataScope: DataScope;
}

export interface AssignUserRolesInput {
  userId: string;
  roleIds: string[];
}

export interface MenuDto {
  id: string;
  moduleName: string;
  parentId?: string;
  title: string;
  path: string;
  permissionCode?: string;
  sortOrder: number;
  status: 'active' | 'disabled';
}

export type AuditResult = 'success' | 'failure';

export interface CreateAuditLogInput {
  actorUserId?: string;
  actorAccount?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  traceId?: string;
  ip?: string;
  userAgent?: string;
  result: AuditResult;
  metadata?: Record<string, unknown>;
}
