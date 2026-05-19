import { Inject, Injectable } from '@nestjs/common';
import type { CreateDepartmentInput } from '@work/platform-contract';
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

  async listDepartments() {
    return {
      items: await this.repository.listDepartments(),
    };
  }

  async createDepartment(input: CreateDepartmentInput, auditContext: PlatformAuditContext = {}) {
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
}
