import type { HttpClient } from '@work/http-client';
import type {
  CreateRoleInput,
  DepartmentDto,
  EmployeeDto,
  PermissionDto,
  RoleDto,
  UpdateDepartmentInput,
  UpdateRoleInput,
} from '@work/platform-contract';

export interface PlatformRolesApiClient {
  listDepartments(): Promise<DepartmentDto[]>;
  createDepartment(input: { code: string; name: string; parentId?: string; managerUserId?: string; sortOrder?: number }): Promise<DepartmentDto>;
  updateDepartment(id: string, input: UpdateDepartmentInput): Promise<DepartmentDto>;
  deleteDepartment(id: string): Promise<void>;
  listEmployees(): Promise<EmployeeDto[]>;
  listRoles(): Promise<RoleDto[]>;
  getRole(id: string): Promise<RoleDto>;
  createRole(input: CreateRoleInput): Promise<RoleDto>;
  updateRole(id: string, input: UpdateRoleInput): Promise<RoleDto>;
  deleteRole(id: string): Promise<void>;
  listPermissions(): Promise<PermissionDto[]>;
  assignUserRoles(userId: string, roleIds: string[]): Promise<unknown>;
}

export function createPlatformRolesApiClient(http: HttpClient): PlatformRolesApiClient {
  return {
    async listDepartments() {
      const response = await http.get<{ items: DepartmentDto[] }>('departments');
      return response.items;
    },
    createDepartment(input) {
      return http.post<DepartmentDto, typeof input>('departments', input);
    },
    updateDepartment(id, input) {
      return http.put<DepartmentDto, UpdateDepartmentInput>(`departments/${encodeURIComponent(id)}`, input);
    },
    deleteDepartment(id) {
      return http.delete<void>(`departments/${encodeURIComponent(id)}`);
    },
    async listEmployees() {
      const response = await http.get<{ items: EmployeeDto[] }>('employees');
      return response.items;
    },
    async listRoles() {
      const response = await http.get<{ items: RoleDto[] }>('roles');
      return response.items;
    },
    getRole(id) {
      return http.get<RoleDto>(`roles/${encodeURIComponent(id)}`);
    },
    createRole(input) {
      return http.post<RoleDto, CreateRoleInput>('roles', input);
    },
    updateRole(id, input) {
      return http.patch<RoleDto, UpdateRoleInput>(`roles/${encodeURIComponent(id)}`, input);
    },
    deleteRole(id) {
      return http.delete<void>(`roles/${encodeURIComponent(id)}`);
    },
    async listPermissions() {
      const response = await http.get<{ items: PermissionDto[] }>('permissions');
      return response.items;
    },
    assignUserRoles(userId, roleIds) {
      return http.put<unknown, { roleIds: string[] }>(`employees/${encodeURIComponent(userId)}/roles`, {
        roleIds,
      });
    },
  };
}
