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
  listEnterprises(): EnterpriseDto[];
  listDepartments(): DepartmentDto[];
  createDepartment(input: CreateDepartmentInput): DepartmentDto;
  findDepartmentById(id: string): DepartmentDto | undefined;
  listEmployees(): EmployeeDto[];
  createEmployee(input: CreateEmployeeInput): EmployeeDto;
  findEmployeeById(id: string): EmployeeDto | undefined;
  validatePassword(account: string, password: string): EmployeeDto | undefined;
  updateEmployee(employee: EmployeeDto): EmployeeDto;
  createAccessSession(input: CreateAccessSessionInput): AccessSession;
  findAccessSession(accessToken: string): AccessSession | undefined;
  listPermissions(): PermissionDto[];
  findPermissionByCode(code: string): PermissionDto | undefined;
  listRoles(): RoleDto[];
  findRoleById(id: string): RoleDto | undefined;
  createRole(input: CreateRoleInput): RoleDto;
  setUserRoles(userId: string, roleIds: string[]): EmployeeDto | undefined;
}

export const PLATFORM_REPOSITORY = Symbol('PLATFORM_REPOSITORY');
