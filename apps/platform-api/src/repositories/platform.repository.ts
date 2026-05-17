import type {
  CreateDepartmentInput,
  CreateEmployeeInput,
  CreateRoleInput,
  DepartmentDto,
  EmployeeDto,
  EnterpriseDto,
  PermissionDto,
  RoleDto,
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

export interface PlatformRepository {
  listEnterprises(): Promise<EnterpriseDto[]>;
  listDepartments(): Promise<DepartmentDto[]>;
  createDepartment(input: CreateDepartmentInput): Promise<DepartmentDto>;
  findDepartmentById(id: string): Promise<DepartmentDto | undefined>;
  listEmployees(): Promise<EmployeeDto[]>;
  createEmployee(input: CreateEmployeeInput): Promise<EmployeeDto>;
  findEmployeeById(id: string): Promise<EmployeeDto | undefined>;
  validatePassword(account: string, password: string): Promise<EmployeeDto | undefined>;
  updateEmployee(employee: EmployeeDto): Promise<EmployeeDto>;
  createAccessSession(input: CreateAccessSessionInput): Promise<AccessSession>;
  findAccessSession(accessToken: string): Promise<AccessSession | undefined>;
  listPermissions(): Promise<PermissionDto[]>;
  findPermissionByCode(code: string): Promise<PermissionDto | undefined>;
  listRoles(): Promise<RoleDto[]>;
  findRoleById(id: string): Promise<RoleDto | undefined>;
  createRole(input: CreateRoleInput): Promise<RoleDto>;
  setUserRoles(userId: string, roleIds: string[]): Promise<EmployeeDto | undefined>;
}

export const PLATFORM_REPOSITORY = Symbol('PLATFORM_REPOSITORY');
