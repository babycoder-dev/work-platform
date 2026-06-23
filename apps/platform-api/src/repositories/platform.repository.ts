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
  StatusLogDto,
  UpdateDepartmentInput,
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

export interface NewStatusLog {
  id: string;
  enterpriseId: string;
  subjectEmployeeId: string;
  authorEmployeeId: string;
  content: string;
  createdAt: string;
}

export interface PlatformRepository {
  listEnterprises(): Promise<EnterpriseDto[]>;
  listDepartments(enterpriseId: string): Promise<DepartmentDto[]>;
  createDepartment(input: CreateDepartmentInput): Promise<DepartmentDto>;
  findDepartmentById(id: string): Promise<DepartmentDto | undefined>;
  updateDepartment(
    id: string,
    input: UpdateDepartmentInput,
    enterpriseId: string,
  ): Promise<DepartmentDto | undefined>;
  softDeleteDepartment(id: string, enterpriseId: string): Promise<boolean>;
  countActiveEmployeesInDepartment(departmentId: string, enterpriseId: string): Promise<number>;
  hasActiveChildDepartments(parentId: string, enterpriseId: string): Promise<boolean>;
  /**
   * 返回 parentDepartmentId 的全部子孙部门 id（不含 parentDepartmentId 本身）。
   * 仅返回与 enterpriseId 一致且 status='active' 的部门。
   * 若 parentDepartmentId 不存在或无子孙，返回 []。
   */
  listDescendantDepartmentIds(parentDepartmentId: string, enterpriseId: string): Promise<string[]>;
  /**
   * 环路防护专用：返回同企业、未软删的全部后代 id，不按 status 过滤。
   * 不用于数据范围解析，避免改变 department_tree 语义。
   */
  listDescendantDepartmentIdsForCycleCheck(
    parentDepartmentId: string,
    enterpriseId: string,
  ): Promise<string[]>;
  listEmployees(): Promise<EmployeeDto[]>;
  createEmployee(input: CreateEmployeeInput): Promise<EmployeeDto>;
  findEmployeeById(id: string): Promise<EmployeeDto | undefined>;
  findEmployeesByIds(ids: string[]): Promise<EmployeeDto[]>;
  findLocalIdentityByAccount(account: string): Promise<LocalIdentitySecurityState | undefined>;
  updateLocalIdentitySecurityState(
    userId: string,
    input: UpdateLocalIdentitySecurityStateInput,
  ): Promise<void>;
  updatePassword(
    userId: string,
    input: UpdatePasswordInput,
    enterpriseId?: string,
  ): Promise<boolean>;
  updateEmployee(employee: EmployeeDto, enterpriseId?: string): Promise<EmployeeDto | undefined>;
  createAccessSession(input: CreateAccessSessionInput): Promise<AccessSession>;
  findAccessSession(accessToken: string): Promise<AccessSession | undefined>;
  listPermissions(): Promise<PermissionDto[]>;
  findPermissionByCode(code: string): Promise<PermissionDto | undefined>;
  listMenusByPermissionCodes(permissionCodes: string[]): Promise<MenuDto[]>;
  listActiveModuleManifests(): Promise<ModuleManifestDto[]>;
  listRoles(enterpriseId: string): Promise<RoleDto[]>;
  findRoleById(id: string): Promise<RoleDto | undefined>;
  createRole(input: CreateRoleInput): Promise<RoleDto>;
  updateRole(
    id: string,
    input: UpdateRoleInput,
    enterpriseId: string,
  ): Promise<RoleDto | undefined>;
  deleteRole(id: string, enterpriseId: string): Promise<boolean>;
  countUsersWithRole(roleId: string): Promise<number>;
  setUserRoles(
    userId: string,
    roleIds: string[],
    enterpriseId: string,
  ): Promise<EmployeeDto | undefined>;
  createStatusLogs(inputs: NewStatusLog[]): Promise<StatusLogDto[]>;
  listStatusLogsBySubject(
    enterpriseId: string,
    subjectEmployeeId: string,
    options: { limit: number; offset: number },
  ): Promise<{ items: StatusLogDto[]; total: number }>;
  recordAuditLog(input: CreateAuditLogInput): Promise<void>;
}

export const PLATFORM_REPOSITORY = Symbol('PLATFORM_REPOSITORY');
