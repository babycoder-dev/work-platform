import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateAuditLogInput,
  CreateDepartmentInput,
  CreateEmployeeInput,
  CreateRoleInput,
  DepartmentDto,
  EmployeeDto,
  EnterpriseDto,
  MenuDto,
  ModuleManifestDto,
  PermissionDto,
  RoleDto,
} from '@work/platform-contract';
import type {
  AccessSession,
  CreateAccessSessionInput,
  LocalIdentitySecurityState,
  PlatformRepository,
  UpdateLocalIdentitySecurityStateInput,
} from '../repositories/platform.repository';
import { hashPassword } from '../security/secret-hash';
import { platformModuleManifests } from '../seeds/seed-data';

interface LocalIdentity {
  userId: string;
  account: string;
  passwordHash: string;
  failedAttempts: number;
  lockedUntil?: string;
  lastLoginAt?: string;
  mustChangePassword: boolean;
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
  readonly accessSessions = new Map<string, AccessSession>();
  readonly permissions = new Map<string, PermissionDto>();
  readonly menus = new Map<string, MenuDto>();
  readonly moduleManifests = new Map<string, ModuleManifestDto>();
  readonly roles = new Map<string, RoleDto>();
  readonly auditLogs: CreateAuditLogInput[] = [];

  constructor() {
    this.seed();
  }

  async listEnterprises(): Promise<EnterpriseDto[]> {
    return [this.enterprise];
  }

  async listDepartments(): Promise<DepartmentDto[]> {
    return Array.from(this.departments.values());
  }

  async findDepartmentById(id: string): Promise<DepartmentDto | undefined> {
    return this.departments.get(id);
  }

  async createDepartment(input: CreateDepartmentInput): Promise<DepartmentDto> {
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

  async listEmployees(): Promise<EmployeeDto[]> {
    return Array.from(this.employees.values());
  }

  async createEmployee(input: CreateEmployeeInput): Promise<EmployeeDto> {
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
      passwordHash: hashPassword(input.initialPassword),
      failedAttempts: 0,
      mustChangePassword: true,
    });

    return employee;
  }

  async findEmployeeById(id: string): Promise<EmployeeDto | undefined> {
    return this.employees.get(id);
  }

  async findEmployeeByAccount(account: string): Promise<EmployeeDto | undefined> {
    const identity = this.identities.get(account);
    if (!identity) {
      return undefined;
    }

    return this.employees.get(identity.userId);
  }

  async findLocalIdentityByAccount(account: string): Promise<LocalIdentitySecurityState | undefined> {
    const identity = this.identities.get(account);
    return identity ? { ...identity } : undefined;
  }

  async updateLocalIdentitySecurityState(
    userId: string,
    input: UpdateLocalIdentitySecurityStateInput,
  ): Promise<void> {
    const identity = Array.from(this.identities.values()).find((item) => item.userId === userId);
    if (!identity) {
      return;
    }

    identity.failedAttempts = input.failedAttempts;
    identity.lockedUntil = input.lockedUntil ?? undefined;
    if (input.lastLoginAt !== undefined) {
      identity.lastLoginAt = input.lastLoginAt;
    }
  }

  async listPermissions(): Promise<PermissionDto[]> {
    return Array.from(this.permissions.values());
  }

  async findPermissionByCode(code: string): Promise<PermissionDto | undefined> {
    return this.permissions.get(code);
  }

  async listMenusByPermissionCodes(permissionCodes: string[]): Promise<MenuDto[]> {
    const granted = new Set(permissionCodes);
    return Array.from(this.menus.values())
      .filter((menu) => menu.status === 'active')
      .filter((menu) => !menu.permissionCode || granted.has(menu.permissionCode))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title));
  }

  async listActiveModuleManifests(): Promise<ModuleManifestDto[]> {
    return Array.from(this.moduleManifests.values())
      .filter((manifest) => manifest.status === 'active')
      .sort((left, right) => left.moduleName.localeCompare(right.moduleName));
  }

  async upsertPermission(permission: PermissionDto): Promise<PermissionDto> {
    this.permissions.set(permission.code, permission);
    return permission;
  }

  async listRoles(): Promise<RoleDto[]> {
    return Array.from(this.roles.values());
  }

  async findRoleById(id: string): Promise<RoleDto | undefined> {
    return this.roles.get(id);
  }

  async createRole(input: CreateRoleInput): Promise<RoleDto> {
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

  async setUserRoles(userId: string, roleIds: string[]): Promise<EmployeeDto | undefined> {
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

  async updateEmployee(employee: EmployeeDto): Promise<EmployeeDto> {
    this.employees.set(employee.id, employee);
    return employee;
  }

  async createAccessSession(input: CreateAccessSessionInput): Promise<AccessSession> {
    const session: AccessSession = {
      accessToken: input.accessToken,
      userId: input.userId,
      expiresAt: input.expiresAt,
    };

    this.accessSessions.set(session.accessToken, session);
    return session;
  }

  async findAccessSession(accessToken: string): Promise<AccessSession | undefined> {
    return this.accessSessions.get(accessToken);
  }

  async recordAuditLog(input: CreateAuditLogInput): Promise<void> {
    this.auditLogs.push(input);
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

    for (const manifest of platformModuleManifests) {
      this.moduleManifests.set(manifest.moduleName, manifest);
    }

    const seedPermissions = platformModuleManifests.flatMap((manifest) => manifest.permissions);
    for (const permission of seedPermissions) {
      this.permissions.set(permission.code, permission);
    }

    const seedMenus = platformModuleManifests.flatMap((manifest) => manifest.menus);
    for (const menu of seedMenus) {
      this.menus.set(menu.id, menu);
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
      passwordHash: hashPassword('admin123'),
      failedAttempts: 0,
      mustChangePassword: true,
    });
  }
}
