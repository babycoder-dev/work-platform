import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '@work/event-bus';
import { platformEvents } from '@work/platform-contract';
import type {
  AssignUserRolesInput,
  CreateEmployeeInput,
  CurrentUserDto,
  EmployeeDto,
  PlatformScope,
  ProfileUpdatedPayload,
  ResetEmployeePasswordInput,
  UpdateEmployeeProfileInput,
  UpdateEmployeeStatusInput,
  UpdateMyProfileInput,
} from '@work/platform-contract';
import type { PlatformAuditContext } from '../auth/request-user';
import { PLATFORM_REPOSITORY, type PlatformRepository } from '../repositories/platform.repository';
import { PlatformScopeService } from '../scope/platform-scope.service';
import { hashPassword } from '../security/secret-hash';

type ProfileUpdateMode = 'self' | 'management';
type ProfileField = 'name' | 'title' | 'mobile' | 'email' | 'departmentId';

@Injectable()
export class EmployeeService {
  private readonly logger = new Logger(EmployeeService.name);

  constructor(
    @Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository,
    @Inject(PlatformScopeService)
    private readonly scopeService: PlatformScopeService,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
  ) {}

  async listEmployees(currentUser: CurrentUserDto) {
    const scope = await this.scopeService.resolveScope(currentUser, 'profile');
    const all = await this.repository.listEmployees();
    const items = all.filter((employee) => this.matchScope(employee, scope));
    return {
      items,
    };
  }

  async getEmployeeById(id: string, currentUser: CurrentUserDto): Promise<EmployeeDto> {
    const employee = await this.repository.findEmployeeById(id);
    if (!employee) {
      throw new NotFoundException('员工不存在');
    }
    const scope = await this.scopeService.resolveScope(currentUser, 'profile');
    if (!this.matchScope(employee, scope)) {
      throw new NotFoundException('员工不存在');
    }
    return employee;
  }

  async getMyProfile(currentUser: CurrentUserDto): Promise<EmployeeDto> {
    const employee = await this.repository.findEmployeeById(currentUser.id);
    if (!employee || employee.enterpriseId !== currentUser.enterpriseId) {
      throw new NotFoundException('员工不存在');
    }
    return employee;
  }

  private matchScope(employee: EmployeeDto, scope: PlatformScope): boolean {
    if (employee.enterpriseId !== scope.enterpriseId) {
      return false;
    }
    switch (scope.kind) {
      case 'company':
        return true;
      case 'self':
        return employee.id === scope.userId;
      case 'department':
      case 'department_tree':
        return (
          employee.departmentId !== undefined && scope.departmentIds.includes(employee.departmentId)
        );
    }
  }

  async updateEmployeeProfile(
    id: string,
    input: UpdateMyProfileInput | UpdateEmployeeProfileInput,
    mode: ProfileUpdateMode,
    currentUser: CurrentUserDto,
    auditContext: PlatformAuditContext = {},
  ): Promise<EmployeeDto> {
    const action = 'platform.employee.profile.update';
    const employee = await this.repository.findEmployeeById(id);
    if (!employee || employee.enterpriseId !== currentUser.enterpriseId) {
      await this.recordFailureAudit(action, id, auditContext);
      throw new NotFoundException('员工不存在');
    }
    if (mode === 'self' && employee.id !== currentUser.id) {
      await this.recordFailureAudit(action, id, auditContext);
      throw new NotFoundException('员工不存在');
    }
    if (mode === 'management') {
      const scope = await this.scopeService.resolveScope(currentUser, 'profile');
      if (!this.matchScope(employee, scope)) {
        await this.recordFailureAudit(action, id, auditContext);
        throw new NotFoundException('员工不存在');
      }
      const requestedDepartmentId = (input as UpdateEmployeeProfileInput).departmentId;
      if (requestedDepartmentId !== undefined && requestedDepartmentId !== null) {
        const department = await this.repository.findDepartmentById(requestedDepartmentId);
        if (!department || department.enterpriseId !== currentUser.enterpriseId) {
          await this.recordFailureAudit(action, id, auditContext);
          throw new NotFoundException('部门不存在');
        }
      }
    }

    const { next, changedFields } = this.buildProfileUpdate(employee, input, mode);
    const saved = await this.repository.updateEmployee(next, currentUser.enterpriseId);
    if (!saved) {
      await this.recordFailureAudit(action, id, auditContext);
      throw new NotFoundException('员工不存在');
    }

    await this.repository.recordAuditLog({
      actorUserId: auditContext.actorUserId,
      actorAccount: auditContext.actorAccount,
      action,
      resourceType: 'platform.employee',
      resourceId: saved.id,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'success',
      metadata: {
        mode,
        changedFields,
      },
    });

    if (saved.id !== currentUser.id && changedFields.length > 0) {
      try {
        await this.eventBus.publish<ProfileUpdatedPayload>({
          type: platformEvents.profileUpdated,
          source: 'platform.api',
          traceId: auditContext.traceId,
          payload: {
            enterpriseId: currentUser.enterpriseId,
            subjectUserId: saved.id,
            changedBy: currentUser.id,
            changedFields,
          },
        });
      } catch (error) {
        this.logger.warn(
          `profile.updated publish failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return saved;
  }

  private buildProfileUpdate(
    employee: EmployeeDto,
    input: UpdateMyProfileInput | UpdateEmployeeProfileInput,
    mode: ProfileUpdateMode,
  ): { next: EmployeeDto; changedFields: ProfileField[] } {
    const allowedFields: ProfileField[] =
      mode === 'self' ? ['name', 'title', 'mobile', 'email'] : ['name', 'title', 'mobile', 'email', 'departmentId'];
    const next: EmployeeDto = { ...employee };
    const changedFields: ProfileField[] = [];
    for (const field of allowedFields) {
      const rawValue = input[field as keyof typeof input] as string | null | undefined;
      if (rawValue === undefined) {
        continue;
      }
      const nextValue = rawValue === null ? undefined : rawValue;
      if ((employee[field] ?? undefined) !== nextValue) {
        (next as Record<ProfileField, string | undefined>)[field] = nextValue;
        changedFields.push(field);
      }
    }
    return { next, changedFields };
  }

  async createEmployee(input: CreateEmployeeInput, auditContext: PlatformAuditContext = {}) {
    if (input.departmentId !== undefined) {
      const department = await this.repository.findDepartmentById(input.departmentId);
      if (!department || department.enterpriseId !== input.enterpriseId) {
        await this.recordFailureAudit('platform.employee.create', undefined, auditContext);
        throw new NotFoundException('部门不存在');
      }
    }
    const employee = await this.repository.createEmployee(input);
    await this.repository.recordAuditLog({
      actorUserId: auditContext.actorUserId,
      actorAccount: auditContext.actorAccount,
      action: 'platform.employee.create',
      resourceType: 'platform.employee',
      resourceId: employee.id,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'success',
      metadata: {
        enterpriseId: employee.enterpriseId,
        employeeNo: employee.employeeNo,
        account: employee.account,
        roleIds: employee.roleIds,
      },
    });

    return employee;
  }

  async updateStatus(
    id: string,
    input: UpdateEmployeeStatusInput,
    enterpriseId: string,
    auditContext: PlatformAuditContext = {},
  ): Promise<EmployeeDto> {
    const employee = await this.repository.findEmployeeById(id);
    if (!employee || employee.enterpriseId !== enterpriseId) {
      await this.recordFailureAudit('platform.employee.status.update', id, auditContext);
      throw new NotFoundException('员工不存在');
    }

    const updated: EmployeeDto = {
      ...employee,
      status: input.status,
    };

    const saved = await this.repository.updateEmployee(updated, enterpriseId);
    if (!saved) {
      await this.recordFailureAudit('platform.employee.status.update', id, auditContext);
      throw new NotFoundException('员工不存在');
    }
    await this.repository.recordAuditLog({
      actorUserId: auditContext.actorUserId,
      actorAccount: auditContext.actorAccount,
      action: 'platform.employee.status.update',
      resourceType: 'platform.employee',
      resourceId: saved.id,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'success',
      metadata: {
        previousStatus: employee.status,
        status: saved.status,
      },
    });

    return saved;
  }

  async assignRoles(
    input: AssignUserRolesInput,
    enterpriseId: string,
    auditContext: PlatformAuditContext = {},
  ) {
    let employee: EmployeeDto | undefined;
    try {
      const availableRoleIds = new Set(
        (await this.repository.listRoles(enterpriseId)).map((role) => role.id),
      );
      if (input.roleIds.some((roleId) => !availableRoleIds.has(roleId))) {
        throw new NotFoundException('角色不存在');
      }
      employee = await this.repository.setUserRoles(input.userId, input.roleIds, enterpriseId);
      if (!employee) {
        throw new NotFoundException('员工不存在');
      }
    } catch (error) {
      await this.recordFailureAudit('platform.employee.roles.assign', input.userId, auditContext);
      throw error;
    }

    await this.repository.recordAuditLog({
      actorUserId: auditContext.actorUserId,
      actorAccount: auditContext.actorAccount,
      action: 'platform.employee.roles.assign',
      resourceType: 'platform.employee',
      resourceId: employee.id,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'success',
      metadata: {
        roleIds: employee.roleIds,
      },
    });

    return employee;
  }

  async resetPassword(
    employeeId: string,
    input: ResetEmployeePasswordInput,
    enterpriseId: string,
    auditContext: PlatformAuditContext = {},
  ): Promise<EmployeeDto> {
    const employee = await this.repository.findEmployeeById(employeeId);
    if (!employee || employee.enterpriseId !== enterpriseId) {
      await this.recordFailureAudit('platform.employee.password.reset', employeeId, auditContext);
      throw new NotFoundException('员工不存在');
    }

    const updated = await this.repository.updatePassword(
      employeeId,
      {
        passwordHash: hashPassword(input.newPassword),
        mustChangePassword: true,
      },
      enterpriseId,
    );
    if (!updated) {
      await this.recordFailureAudit('platform.employee.password.reset', employeeId, auditContext);
      throw new NotFoundException('员工不存在');
    }
    await this.repository.recordAuditLog({
      actorUserId: auditContext.actorUserId,
      actorAccount: auditContext.actorAccount,
      action: 'platform.employee.password.reset',
      resourceType: 'platform.employee',
      resourceId: employeeId,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'success',
      metadata: {
        account: employee.account,
        employeeStatus: employee.status,
        mustChangePassword: true,
        lockoutCleared: true,
      },
    });

    return {
      ...employee,
      mustChangePassword: true,
    };
  }

  private async recordFailureAudit(
    action: string,
    resourceId: string | undefined,
    auditContext: PlatformAuditContext,
  ) {
    await this.repository.recordAuditLog({
      actorUserId: auditContext.actorUserId,
      actorAccount: auditContext.actorAccount,
      action,
      resourceType: 'platform.employee',
      resourceId,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'failure',
      metadata: {
        reason: 'request_rejected',
      },
    });
  }
}
