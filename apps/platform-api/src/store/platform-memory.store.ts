import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
import type { PlatformRepository } from '../repositories/platform.repository';

interface LocalIdentity {
  userId: string;
  account: string;
  password: string;
  failedAttempts: number;
  lockedAt?: string;
}

@Injectable()
export class PlatformMemoryStore implements PlatformRepository {
  readonly enterprise: EnterpriseDto = {
    id: 'ent-default',
    name: '默认企业',
    code: 'default',
    status: 'active',
  };

  readonly departments = new Map<string, DepartmentDto>();
  readonly employees = new Map<string, EmployeeDto>();
  readonly identities = new Map<string, LocalIdentity>();
  readonly permissions = new Map<string, PermissionDto>();
  readonly roles = new Map<string, RoleDto>();

  constructor() {
    this.seed();
  }

  listEnterprises(): EnterpriseDto[] {
    return [this.enterprise];
  }

  listDepartments(): DepartmentDto[] {
    return Array.from(this.departments.values());
  }

  findDepartmentById(id: string): DepartmentDto | undefined {
    return this.departments.get(id);
  }

  createDepartment(input: CreateDepartmentInput): DepartmentDto {
    const department: DepartmentDto = {
      id: randomUUID(),
      enterpriseId: input.enterpriseId,
      name: input.name,
      code: input.code,
      parentId: input.parentId,
      managerUserId: input.managerUserId,
      sortOrder: input.sortOrder ?? 100,
      status: 'active',
    };

    this.departments.set(department.id, department);
    return department;
  }

  listEmployees(): EmployeeDto[] {
    return Array.from(this.employees.values());
  }

  createEmployee(input: CreateEmployeeInput): EmployeeDto {
    const employee: EmployeeDto = {
      id: randomUUID(),
      enterpriseId: input.enterpriseId,
      employeeNo: input.employeeNo,
      account: input.account,
      name: input.name,
      departmentId: input.departmentId,
      title: input.title,
      mobile: input.mobile,
      email: input.email,
      status: 'active',
      roleIds: input.roleIds ?? [],
      mustChangePassword: true,
    };

    this.employees.set(employee.id, employee);
    this.identities.set(input.account, {
      userId: employee.id,
      account: input.account,
      password: input.initialPassword,
      failedAttempts: 0,
    });

    return employee;
  }

  findEmployeeById(id: string): EmployeeDto | undefined {
    return this.employees.get(id);
  }

  findEmployeeByAccount(account: string): EmployeeDto | undefined {
    const identity = this.identities.get(account);
    if (!identity) {
      return undefined;
    }

    return this.employees.get(identity.userId);
  }

  validatePassword(account: string, password: string): EmployeeDto | undefined {
    const identity = this.identities.get(account);
    if (!identity || identity.password !== password) {
      return undefined;
    }

    return this.employees.get(identity.userId);
  }

  listPermissions(): PermissionDto[] {
    return Array.from(this.permissions.values());
  }

  findPermissionByCode(code: string): PermissionDto | undefined {
    return this.permissions.get(code);
  }

  upsertPermission(permission: PermissionDto): PermissionDto {
    this.permissions.set(permission.code, permission);
    return permission;
  }

  listRoles(): RoleDto[] {
    return Array.from(this.roles.values());
  }

  findRoleById(id: string): RoleDto | undefined {
    return this.roles.get(id);
  }

  createRole(input: CreateRoleInput): RoleDto {
    const role: RoleDto = {
      id: randomUUID(),
      enterpriseId: input.enterpriseId,
      code: input.code,
      name: input.name,
      description: input.description,
      permissionCodes: input.permissionCodes,
      dataScope: input.dataScope,
      status: 'active',
    };

    this.roles.set(role.id, role);
    return role;
  }

  setUserRoles(userId: string, roleIds: string[]): EmployeeDto | undefined {
    const employee = this.employees.get(userId);
    if (!employee) {
      return undefined;
    }

    const updated: EmployeeDto = {
      ...employee,
      roleIds,
    };

    this.employees.set(userId, updated);
    return updated;
  }

  updateEmployee(employee: EmployeeDto): EmployeeDto {
    this.employees.set(employee.id, employee);
    return employee;
  }

  private seed() {
    const rootDepartment: DepartmentDto = {
      id: 'dept-root',
      enterpriseId: this.enterprise.id,
      name: '总部',
      code: 'HQ',
      sortOrder: 1,
      status: 'active',
    };
    this.departments.set(rootDepartment.id, rootDepartment);

    const seedPermissions: PermissionDto[] = [
      { code: 'platform:employee:view', name: '查看员工', moduleName: 'platform' },
      { code: 'platform:employee:create', name: '创建员工', moduleName: 'platform' },
      { code: 'platform:role:manage', name: '管理角色', moduleName: 'platform' },
      { code: 'platform:permission:view', name: '查看权限', moduleName: 'platform' },
      { code: 'presence:board:view', name: '查看在位看板', moduleName: 'presence' },
      { code: 'presence:status:create', name: '登记在位状态', moduleName: 'presence' },
      { code: 'approval:task:approve', name: '处理审批任务', moduleName: 'approval' },
      { code: 'report:weekly:view', name: '查看周报', moduleName: 'report' },
    ];

    for (const permission of seedPermissions) {
      this.permissions.set(permission.code, permission);
    }

    const adminRole: RoleDto = {
      id: 'role-admin',
      enterpriseId: this.enterprise.id,
      code: 'admin',
      name: '系统管理员',
      permissionCodes: seedPermissions.map((permission) => permission.code),
      dataScope: 'company',
      status: 'active',
    };
    this.roles.set(adminRole.id, adminRole);

    const admin: EmployeeDto = {
      id: 'user-admin',
      enterpriseId: this.enterprise.id,
      employeeNo: '000001',
      account: 'admin',
      name: '系统管理员',
      departmentId: rootDepartment.id,
      status: 'active',
      roleIds: [adminRole.id],
      mustChangePassword: true,
    };
    this.employees.set(admin.id, admin);
    this.identities.set(admin.account, {
      userId: admin.id,
      account: admin.account,
      password: 'admin123',
      failedAttempts: 0,
    });
  }
}
