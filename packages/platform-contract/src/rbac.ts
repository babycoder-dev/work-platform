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
