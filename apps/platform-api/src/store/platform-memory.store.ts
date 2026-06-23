import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiError } from '@work/errors';
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
  StatusLogDto,
  UpdateDepartmentInput,
  UpdateRoleInput,
} from '@work/platform-contract';
import type {
  AccessSession,
  CreateAccessSessionInput,
  LocalIdentitySecurityState,
  PlatformRepository,
  UpdateLocalIdentitySecurityStateInput,
  UpdatePasswordInput,
} from '../repositories/platform.repository';
import type { NewStatusLog } from '../repositories/platform.repository';
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

type StoredDepartment = DepartmentDto & { deletedAt?: string };
type StoredStatusLog = StatusLogDto & { deletedAt?: string };

@Injectable()
export class PlatformMemoryStore implements PlatformRepository {
  readonly enterprise: EnterpriseDto = {
    id: 'ent-default',
    name: '默认企业',
    code: 'default',
    status: 'active',
  };

  readonly departments = new Map<string, StoredDepartment>();
  readonly employees = new Map<string, EmployeeDto>();
  readonly identities = new Map<string, LocalIdentity>();
  readonly accessSessions = new Map<string, AccessSession>();
  readonly permissions = new Map<string, PermissionDto>();
  readonly menus = new Map<string, MenuDto>();
  readonly moduleManifests = new Map<string, ModuleManifestDto>();
  readonly roles = new Map<string, RoleDto>();
  readonly statusLogs = new Map<string, StoredStatusLog>();
  readonly auditLogs: CreateAuditLogInput[] = [];

  constructor() {
    this.seed();
  }

  async listEnterprises(): Promise<EnterpriseDto[]> {
    return [this.enterprise];
  }

  async listDepartments(enterpriseId: string): Promise<DepartmentDto[]> {
    return Array.from(this.departments.values())
      .filter((department) => department.enterpriseId === enterpriseId && !department.deletedAt)
      .map(toDepartmentDto);
  }

  async findDepartmentById(id: string): Promise<DepartmentDto | undefined> {
    const department = this.departments.get(id);
    return department && !department.deletedAt ? toDepartmentDto(department) : undefined;
  }

  async listDescendantDepartmentIds(
    parentDepartmentId: string,
    enterpriseId: string,
  ): Promise<string[]> {
    const result: string[] = [];
    const queue: string[] = [parentDepartmentId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        continue;
      }
      for (const department of this.departments.values()) {
        if (
          department.parentId === current &&
          department.enterpriseId === enterpriseId &&
          department.status === 'active'
        ) {
          result.push(department.id);
          queue.push(department.id);
        }
      }
    }
    return result;
  }

  async createDepartment(input: CreateDepartmentInput): Promise<DepartmentDto> {
    const department: StoredDepartment = {
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
    return toDepartmentDto(department);
  }

  async updateDepartment(
    id: string,
    input: UpdateDepartmentInput,
    enterpriseId: string,
  ): Promise<DepartmentDto | undefined> {
    const department = this.departments.get(id);
    if (!department || department.enterpriseId !== enterpriseId || department.deletedAt) {
      return undefined;
    }

    const updated: StoredDepartment = {
      ...department,
      ...(Object.hasOwn(input, 'name') ? { name: input.name ?? department.name } : {}),
      ...(Object.hasOwn(input, 'parentId') ? { parentId: input.parentId ?? undefined } : {}),
      ...(Object.hasOwn(input, 'managerUserId')
        ? { managerUserId: input.managerUserId ?? undefined }
        : {}),
      ...(Object.hasOwn(input, 'sortOrder')
        ? { sortOrder: input.sortOrder ?? department.sortOrder }
        : {}),
    };

    this.departments.set(id, updated);
    return toDepartmentDto(updated);
  }

  async softDeleteDepartment(id: string, enterpriseId: string): Promise<boolean> {
    const department = this.departments.get(id);
    if (!department || department.enterpriseId !== enterpriseId || department.deletedAt) {
      return false;
    }
    const activeEmployees = await this.countActiveEmployeesInDepartment(id, enterpriseId);
    const hasActiveChildren = await this.hasActiveChildDepartments(id, enterpriseId);
    if (activeEmployees > 0 || hasActiveChildren) {
      return false;
    }
    this.departments.set(id, {
      ...department,
      deletedAt: new Date().toISOString(),
    });
    return true;
  }

  async countActiveEmployeesInDepartment(
    departmentId: string,
    enterpriseId: string,
  ): Promise<number> {
    return Array.from(this.employees.values()).filter(
      (employee) =>
        employee.enterpriseId === enterpriseId &&
        employee.departmentId === departmentId &&
        employee.status === 'active',
    ).length;
  }

  async hasActiveChildDepartments(parentId: string, enterpriseId: string): Promise<boolean> {
    return Array.from(this.departments.values()).some(
      (department) =>
        department.enterpriseId === enterpriseId &&
        department.parentId === parentId &&
        !department.deletedAt,
    );
  }

  async listDescendantDepartmentIdsForCycleCheck(
    parentDepartmentId: string,
    enterpriseId: string,
  ): Promise<string[]> {
    const result: string[] = [];
    const queue: string[] = [parentDepartmentId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        continue;
      }
      for (const department of this.departments.values()) {
        if (
          department.parentId === current &&
          department.enterpriseId === enterpriseId &&
          !department.deletedAt
        ) {
          result.push(department.id);
          queue.push(department.id);
        }
      }
    }
    return result;
  }

  async listEmployees(): Promise<EmployeeDto[]> {
    return Array.from(this.employees.values());
  }

  async createEmployee(input: CreateEmployeeInput): Promise<EmployeeDto> {
    if (
      input.departmentId !== undefined &&
      (this.departments.get(input.departmentId)?.enterpriseId !== input.enterpriseId ||
        this.departments.get(input.departmentId)?.deletedAt)
    ) {
      throw new ApiError('PLATFORM_REFERENCE_NOT_FOUND', '关联资源不存在', { status: 400 });
    }
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
      roleIds: [],
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

  async findEmployeesByIds(ids: string[]): Promise<EmployeeDto[]> {
    return ids
      .map((id) => this.employees.get(id))
      .filter((employee): employee is EmployeeDto => employee !== undefined);
  }

  async findEmployeeByAccount(account: string): Promise<EmployeeDto | undefined> {
    const identity = this.identities.get(account);
    if (!identity) {
      return undefined;
    }

    return this.employees.get(identity.userId);
  }

  async findLocalIdentityByAccount(
    account: string,
  ): Promise<LocalIdentitySecurityState | undefined> {
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

  async updatePassword(
    userId: string,
    input: UpdatePasswordInput,
    enterpriseId?: string,
  ): Promise<boolean> {
    const identity = Array.from(this.identities.values()).find((item) => item.userId === userId);
    const employee = this.employees.get(userId);
    if (
      !identity ||
      !employee ||
      (enterpriseId !== undefined && employee.enterpriseId !== enterpriseId)
    ) {
      return false;
    }

    identity.passwordHash = input.passwordHash;
    identity.mustChangePassword = input.mustChangePassword;
    identity.failedAttempts = 0;
    identity.lockedUntil = undefined;

    this.employees.set(userId, {
      ...employee,
      mustChangePassword: input.mustChangePassword,
    });
    return true;
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
      .sort(
        (left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title),
      );
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

  async listRoles(enterpriseId: string): Promise<RoleDto[]> {
    return Array.from(this.roles.values()).filter((role) => role.enterpriseId === enterpriseId);
  }

  async findRoleById(id: string): Promise<RoleDto | undefined> {
    return this.roles.get(id);
  }

  async createRole(input: CreateRoleInput): Promise<RoleDto> {
    if (
      Array.from(this.roles.values()).some(
        (role) => role.enterpriseId === input.enterpriseId && role.code === input.code,
      )
    ) {
      throw new ApiError('PLATFORM_DUPLICATE_RESOURCE', '资源已存在', { status: 409 });
    }

    const role: RoleDto = {
      id: randomUUID(),
      enterpriseId: input.enterpriseId,
      code: input.code,
      name: input.name,
      description: input.description,
      permissionCodes: input.permissionCodes,
      dataScopes: input.dataScopes,
      isSystem: false,
      status: 'active',
    };

    this.roles.set(role.id, role);
    return role;
  }

  async updateRole(
    id: string,
    input: UpdateRoleInput,
    enterpriseId: string,
  ): Promise<RoleDto | undefined> {
    const role = this.roles.get(id);
    if (!role || role.enterpriseId !== enterpriseId) {
      return undefined;
    }

    const updated: RoleDto = {
      ...role,
      name: input.name ?? role.name,
      description: input.description ?? role.description,
      permissionCodes: input.permissionCodes ?? role.permissionCodes,
      dataScopes: input.dataScopes ?? role.dataScopes,
      status: input.status ?? role.status,
    };
    this.roles.set(id, updated);
    return updated;
  }

  async deleteRole(id: string, enterpriseId: string): Promise<boolean> {
    const role = this.roles.get(id);
    if (!role || role.enterpriseId !== enterpriseId) {
      return false;
    }
    return this.roles.delete(id);
  }

  async countUsersWithRole(roleId: string): Promise<number> {
    return Array.from(this.employees.values()).filter((employee) =>
      employee.roleIds.includes(roleId),
    ).length;
  }

  async setUserRoles(
    userId: string,
    roleIds: string[],
    enterpriseId: string,
  ): Promise<EmployeeDto | undefined> {
    const employee = this.employees.get(userId);
    if (!employee || employee.enterpriseId !== enterpriseId) {
      return undefined;
    }
    if (roleIds.some((roleId) => this.roles.get(roleId)?.enterpriseId !== enterpriseId)) {
      throw new ApiError('PLATFORM_REFERENCE_NOT_FOUND', '关联资源不存在', { status: 400 });
    }

    const updated: EmployeeDto = {
      ...employee,
      roleIds,
    };

    this.employees.set(userId, updated);
    return updated;
  }

  async createStatusLogs(inputs: NewStatusLog[]): Promise<StatusLogDto[]> {
    const created = inputs.map((input) => ({ ...input }));
    for (const item of created) {
      this.statusLogs.set(item.id, item);
    }
    return created.map(toStatusLogDto);
  }

  async listStatusLogsBySubject(
    enterpriseId: string,
    subjectEmployeeId: string,
    options: { limit: number; offset: number },
  ): Promise<{ items: StatusLogDto[]; total: number }> {
    const items = Array.from(this.statusLogs.values())
      .filter(
        (log) =>
          log.enterpriseId === enterpriseId &&
          log.subjectEmployeeId === subjectEmployeeId &&
          !log.deletedAt,
      )
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      );
    return {
      items: items.slice(options.offset, options.offset + options.limit).map(toStatusLogDto),
      total: items.length,
    };
  }

  async updateEmployee(
    employee: EmployeeDto,
    enterpriseId?: string,
  ): Promise<EmployeeDto | undefined> {
    const existing = this.employees.get(employee.id);
    if (!existing || (enterpriseId !== undefined && existing.enterpriseId !== enterpriseId)) {
      return undefined;
    }
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
    const rootDepartment: StoredDepartment = {
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
      dataScopes: [
        { dataType: 'profile', scope: 'company' },
        { dataType: 'presence', scope: 'company' },
        { dataType: 'report', scope: 'company' },
      ],
      isSystem: true,
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

function toDepartmentDto(department: StoredDepartment): DepartmentDto {
  return {
    id: department.id,
    enterpriseId: department.enterpriseId,
    code: department.code,
    name: department.name,
    parentId: department.parentId,
    managerUserId: department.managerUserId,
    sortOrder: department.sortOrder,
    status: department.status,
  };
}

function toStatusLogDto(statusLog: StoredStatusLog): StatusLogDto {
  return {
    id: statusLog.id,
    enterpriseId: statusLog.enterpriseId,
    subjectEmployeeId: statusLog.subjectEmployeeId,
    authorEmployeeId: statusLog.authorEmployeeId,
    content: statusLog.content,
    createdAt: statusLog.createdAt,
  };
}
