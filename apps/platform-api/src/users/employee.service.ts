import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AssignUserRolesInput,
  CreateEmployeeInput,
  EmployeeDto,
  UpdateEmployeeStatusInput,
} from '@work/platform-contract';
import type { PlatformAuditContext } from '../auth/request-user';
import { PLATFORM_REPOSITORY, type PlatformRepository } from '../repositories/platform.repository';

@Injectable()
export class EmployeeService {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository) {}

  async listEmployees() {
    return {
      items: await this.repository.listEmployees(),
    };
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
}
