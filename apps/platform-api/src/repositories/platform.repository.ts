import type {
  CreateDepartmentInput,
  CreateAuditLogInput,
  CreateEmployeeInput,
  CreateRoleInput,
  DepartmentDto,
  EmployeeDto,
  EnterpriseDto,
  MenuDto,
  ModuleManifestDto,
  PermissionDto,
  RoleDto,
  UpdateRoleInput,
} from '@work/platform-contract';

export interface AccessSession {
  accessToken: string;
  userId: string;
  expiresAt: string;
}

export interface CreateAccessSessionInput {
  accessToken: string;
  userId: string;
  expiresAt: string;
}

export interface LocalIdentitySecurityState {
  userId: string;
  account: string;
  passwordHash: string;
  failedAttempts: number;
  lockedUntil?: string;
  mustChangePassword: boolean;
}

export interface UpdateLocalIdentitySecurityStateInput {
  failedAttempts: number;
  lockedUntil: string | null;
  lastLoginAt?: string;
}

export interface UpdatePasswordInput {
  passwordHash: string;
  mustChangePassword: boolean;
}

export interface PlatformRepository {
  listEnterprises(): Promise<EnterpriseDto[]>;
  listDepartments(): Promise<DepartmentDto[]>;
  createDepartment(input: CreateDepartmentInput): Promise<DepartmentDto>;
  findDepartmentById(id: string): Promise<DepartmentDto | undefined>;
  /**
   * 返回 parentDepartmentId 的全部子孙部门 id（不含 parentDepartmentId 本身）。
   * 仅返回与 enterpriseId 一致且 status='active' 的部门。
   * 若 parentDepartmentId 不存在或无子孙，返回 []。
   */
  listDescendantDepartmentIds(parentDepartmentId: string, enterpriseId: string): Promise<string[]>;
  listEmployees(): Promise<EmployeeDto[]>;
  createEmployee(input: CreateEmployeeInput): Promise<EmployeeDto>;
  findEmployeeById(id: string): Promise<EmployeeDto | undefined>;
  findLocalIdentityByAccount(account: string): Promise<LocalIdentitySecurityState | undefined>;
  updateLocalIdentitySecurityState(userId: string, input: UpdateLocalIdentitySecurityStateInput): Promise<void>;
  updatePassword(userId: string, input: UpdatePasswordInput): Promise<void>;
  updateEmployee(employee: EmployeeDto): Promise<EmployeeDto>;
  createAccessSession(input: CreateAccessSessionInput): Promise<AccessSession>;
  findAccessSession(accessToken: string): Promise<AccessSession | undefined>;
  listPermissions(): Promise<PermissionDto[]>;
  findPermissionByCode(code: string): Promise<PermissionDto | undefined>;
  listMenusByPermissionCodes(permissionCodes: string[]): Promise<MenuDto[]>;
  listActiveModuleManifests(): Promise<ModuleManifestDto[]>;
  listRoles(): Promise<RoleDto[]>;
  findRoleById(id: string): Promise<RoleDto | undefined>;
  createRole(input: CreateRoleInput): Promise<RoleDto>;
  updateRole(id: string, input: UpdateRoleInput): Promise<RoleDto | undefined>;
  deleteRole(id: string): Promise<boolean>;
  countUsersWithRole(roleId: string): Promise<number>;
  setUserRoles(userId: string, roleIds: string[]): Promise<EmployeeDto | undefined>;
  recordAuditLog(input: CreateAuditLogInput): Promise<void>;
}

export const PLATFORM_REPOSITORY = Symbol('PLATFORM_REPOSITORY');
