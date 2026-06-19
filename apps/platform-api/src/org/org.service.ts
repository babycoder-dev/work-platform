import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ApiError } from '@work/errors';
import type { CreateDepartmentInput, DepartmentDto, UpdateDepartmentInput } from '@work/platform-contract';
import type { PlatformAuditContext } from '../auth/request-user';
import { PLATFORM_REPOSITORY, type PlatformRepository } from '../repositories/platform.repository';

@Injectable()
export class OrgService {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository) {}

  async listEnterprises() {
    return {
      items: await this.repository.listEnterprises(),
    };
  }

  async listDepartments(enterpriseId: string) {
    return {
      items: await this.repository.listDepartments(enterpriseId),
    };
  }

  async createDepartment(input: CreateDepartmentInput, auditContext: PlatformAuditContext = {}) {
    try {
      if (input.parentId !== undefined) {
        await this.assertParentDepartment(input.parentId, input.enterpriseId);
      }
      if (input.managerUserId !== undefined) {
        await this.assertManagerUser(input.managerUserId, input.enterpriseId);
      }
    } catch (error) {
      await this.recordFailureAudit('platform.department.create', undefined, auditContext);
      throw error;
    }

    const department = await this.repository.createDepartment(input);
    await this.repository.recordAuditLog({
      actorUserId: auditContext.actorUserId,
      actorAccount: auditContext.actorAccount,
      action: 'platform.department.create',
      resourceType: 'platform.department',
      resourceId: department.id,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'success',
      metadata: {
        enterpriseId: department.enterpriseId,
        code: department.code,
        name: department.name,
        parentId: department.parentId,
      },
    });

    return department;
  }

  async updateDepartment(
    id: string,
    input: UpdateDepartmentInput,
    enterpriseId: string,
    auditContext: PlatformAuditContext = {},
  ): Promise<DepartmentDto> {
    const department = await this.repository.findDepartmentById(id);
    if (!department || department.enterpriseId !== enterpriseId) {
      await this.recordFailureAudit('platform.department.update', id, auditContext);
      throw new NotFoundException('部门不存在');
    }

    try {
      if (input.parentId !== undefined && input.parentId !== null) {
        await this.assertParentDepartment(input.parentId, enterpriseId);
        await this.assertNoDepartmentCycle(id, input.parentId, enterpriseId);
      }
      if (input.managerUserId !== undefined && input.managerUserId !== null) {
        await this.assertManagerUser(input.managerUserId, enterpriseId);
      }
    } catch (error) {
      await this.recordFailureAudit('platform.department.update', id, auditContext);
      throw error;
    }

    const updated = await this.repository.updateDepartment(id, input, enterpriseId);
    if (!updated) {
      await this.recordFailureAudit('platform.department.update', id, auditContext);
      throw new NotFoundException('部门不存在');
    }

    await this.repository.recordAuditLog({
      actorUserId: auditContext.actorUserId,
      actorAccount: auditContext.actorAccount,
      action: 'platform.department.update',
      resourceType: 'platform.department',
      resourceId: updated.id,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'success',
      metadata: buildDepartmentUpdateMetadata(department, updated, input),
    });

    return updated;
  }

  async deleteDepartment(
    id: string,
    enterpriseId: string,
    auditContext: PlatformAuditContext = {},
  ): Promise<{ success: true }> {
    const department = await this.repository.findDepartmentById(id);
    if (!department || department.enterpriseId !== enterpriseId) {
      await this.recordFailureAudit('platform.department.delete', id, auditContext);
      throw new NotFoundException('部门不存在');
    }

    const [activeEmployees, hasActiveChildren] = await Promise.all([
      this.repository.countActiveEmployeesInDepartment(id, enterpriseId),
      this.repository.hasActiveChildDepartments(id, enterpriseId),
    ]);
    if (activeEmployees > 0 || hasActiveChildren) {
      await this.recordFailureAudit('platform.department.delete', id, auditContext, {
        activeEmployees,
        hasActiveChildren,
      });
      throw new ApiError('PLATFORM_DEPARTMENT_NOT_EMPTY', '部门下仍有人员或子部门，无法删除', {
        status: 409,
      });
    }

    const deleted = await this.repository.softDeleteDepartment(id, enterpriseId);
    if (!deleted) {
      const stillExists = await this.repository.findDepartmentById(id);
      if (!stillExists || stillExists.enterpriseId !== enterpriseId) {
        await this.recordFailureAudit('platform.department.delete', id, auditContext);
        throw new NotFoundException('部门不存在');
      }
      await this.recordFailureAudit('platform.department.delete', id, auditContext, {
        reason: 'concurrent_occupancy_detected',
      });
      throw new ApiError('PLATFORM_DEPARTMENT_NOT_EMPTY', '部门下仍有人员或子部门，无法删除', {
        status: 409,
      });
    }

    await this.repository.recordAuditLog({
      actorUserId: auditContext.actorUserId,
      actorAccount: auditContext.actorAccount,
      action: 'platform.department.delete',
      resourceType: 'platform.department',
      resourceId: id,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'success',
      metadata: {
        enterpriseId,
        code: department.code,
        name: department.name,
      },
    });

    return { success: true };
  }

  private async assertParentDepartment(parentId: string, enterpriseId: string) {
    const parent = await this.repository.findDepartmentById(parentId);
    if (!parent || parent.enterpriseId !== enterpriseId) {
      throw new NotFoundException('父部门不存在');
    }
  }

  private async assertManagerUser(userId: string, enterpriseId: string) {
    const manager = await this.repository.findEmployeeById(userId);
    if (!manager || manager.enterpriseId !== enterpriseId) {
      throw new NotFoundException('负责人不存在');
    }
  }

  private async assertNoDepartmentCycle(id: string, parentId: string, enterpriseId: string) {
    if (id === parentId) {
      throw new ApiError('PLATFORM_DEPARTMENT_CYCLE', '不能移动到自身或子部门下', {
        status: 400,
      });
    }
    const descendants = await this.repository.listDescendantDepartmentIdsForCycleCheck(
      id,
      enterpriseId,
    );
    if (descendants.includes(parentId)) {
      throw new ApiError('PLATFORM_DEPARTMENT_CYCLE', '不能移动到自身或子部门下', {
        status: 400,
      });
    }
  }

  private async recordFailureAudit(
    action: string,
    resourceId: string | undefined,
    auditContext: PlatformAuditContext,
    metadata: Record<string, unknown> = {},
  ) {
    await this.repository.recordAuditLog({
      actorUserId: auditContext.actorUserId,
      actorAccount: auditContext.actorAccount,
      action,
      resourceType: 'platform.department',
      resourceId,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'failure',
      metadata: {
        reason: 'request_rejected',
        ...metadata,
      },
    });
  }
}

function buildDepartmentUpdateMetadata(
  before: DepartmentDto,
  after: DepartmentDto,
  input: UpdateDepartmentInput,
) {
  const changedFields: string[] = [];
  const previous: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};

  for (const field of ['name', 'parentId', 'managerUserId', 'sortOrder'] as const) {
    if (Object.hasOwn(input, field) && before[field] !== after[field]) {
      changedFields.push(field);
      previous[field] = before[field] ?? null;
      next[field] = after[field] ?? null;
    }
  }

  return {
    enterpriseId: after.enterpriseId,
    changedFields,
    previous,
    next,
  };
}
