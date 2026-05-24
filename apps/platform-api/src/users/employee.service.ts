import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AssignUserRolesInput,
  CreateEmployeeInput,
  CurrentUserDto,
  EmployeeDto,
  ResetEmployeePasswordInput,
  UpdateEmployeeStatusInput,
} from '@work/platform-contract';
import type { PlatformAuditContext } from '../auth/request-user';
import { PLATFORM_REPOSITORY, type PlatformRepository } from '../repositories/platform.repository';
import { type PlatformScope, PlatformScopeService } from '../scope/platform-scope.service';
import { hashPassword } from '../security/secret-hash';

@Injectable()
export class EmployeeService {
  constructor(
    @Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository,
    @Inject(PlatformScopeService)
    private readonly scopeService?: PlatformScopeService,
  ) {}

  async listEmployees(currentUser: CurrentUserDto) {
    if (!this.scopeService) {
      throw new Error('PlatformScopeService is not registered');
    }
    const scope = await this.scopeService.resolveScope(currentUser);
    const all = await this.repository.listEmployees();
    const items = all.filter((employee) => this.matchScope(employee, scope));
    return {
      items,
    };
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
        return employee.departmentId !== undefined && scope.departmentIds.includes(employee.departmentId);
    }
  }

  async createEmployee(input: CreateEmployeeInput, auditContext: PlatformAuditContext = {}) {
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
    auditContext: PlatformAuditContext = {},
  ): Promise<EmployeeDto> {
    const employee = await this.repository.findEmployeeById(id);
    if (!employee) {
      throw new NotFoundException('员工不存在');
    }

    const updated: EmployeeDto = {
      ...employee,
      status: input.status,
    };

    const saved = await this.repository.updateEmployee(updated);
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

  async assignRoles(input: AssignUserRolesInput, auditContext: PlatformAuditContext = {}) {
    const employee = await this.repository.setUserRoles(input.userId, input.roleIds);
    if (!employee) {
      throw new NotFoundException('员工不存在');
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
    auditContext: PlatformAuditContext = {},
  ): Promise<EmployeeDto> {
    const employee = await this.repository.findEmployeeById(employeeId);
    if (!employee) {
      throw new NotFoundException('员工不存在');
    }

    await this.repository.updatePassword(employeeId, {
      passwordHash: hashPassword(input.newPassword),
      mustChangePassword: true,
    });
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
}
