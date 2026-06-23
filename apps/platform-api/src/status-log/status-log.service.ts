import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  CreateStatusLogsInput,
  CurrentUserDto,
  ListStatusLogsQuery,
  ListStatusLogsResult,
  StatusLogDto,
} from '@work/platform-contract';
import { randomUUID } from 'node:crypto';
import type { PlatformAuditContext } from '../auth/request-user';
import {
  PLATFORM_REPOSITORY,
  type NewStatusLog,
  type PlatformRepository,
} from '../repositories/platform.repository';
import { PlatformScopeService } from '../scope/platform-scope.service';

@Injectable()
export class StatusLogService {
  private readonly logger = new Logger(StatusLogService.name);

  constructor(
    @Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository,
    @Inject(PlatformScopeService) private readonly scopeService: PlatformScopeService,
  ) {}

  async createStatusLogs(
    input: CreateStatusLogsInput,
    currentUser: CurrentUserDto,
    auditContext: PlatformAuditContext = {},
  ): Promise<StatusLogDto[]> {
    const subjectEmployeeIds = Array.from(new Set(input.subjectEmployeeIds));
    const scope = await this.scopeService.resolveScope(currentUser, 'profile');
    const employees = await this.repository.findEmployeesByIds(subjectEmployeeIds);
    const employeesById = new Map(employees.map((employee) => [employee.id, employee]));

    for (const subjectEmployeeId of subjectEmployeeIds) {
      const employee = employeesById.get(subjectEmployeeId);
      if (
        !employee ||
        employee.enterpriseId !== currentUser.enterpriseId ||
        !this.scopeService.matchesScope(employee, scope)
      ) {
        await this.recordFailureAudit(subjectEmployeeIds.length, auditContext);
        throw new NotFoundException('员工不存在');
      }
    }

    const createdAt = new Date().toISOString();
    const inputs: NewStatusLog[] = subjectEmployeeIds.map((subjectEmployeeId) => ({
      id: randomUUID(),
      enterpriseId: currentUser.enterpriseId,
      subjectEmployeeId,
      authorEmployeeId: currentUser.id,
      content: input.content,
      createdAt,
    }));
    const created = await this.repository.createStatusLogs(inputs);

    await this.repository.recordAuditLog({
      actorUserId: auditContext.actorUserId,
      actorAccount: auditContext.actorAccount,
      action: 'platform.status-log.create',
      resourceType: 'platform.status-log',
      resourceId: undefined,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'success',
      metadata: {
        subjectEmployeeIds,
        subjectCount: subjectEmployeeIds.length,
        contentLength: input.content.length,
      },
    });

    return created;
  }

  async listStatusLogs(
    subjectEmployeeId: string,
    query: ListStatusLogsQuery,
    currentUser: CurrentUserDto,
  ): Promise<ListStatusLogsResult> {
    const subject = await this.repository.findEmployeeById(subjectEmployeeId);
    const scope = await this.scopeService.resolveScope(currentUser, 'profile');
    if (
      !subject ||
      subject.enterpriseId !== currentUser.enterpriseId ||
      !this.scopeService.matchesScope(subject, scope)
    ) {
      throw new NotFoundException('员工不存在');
    }

    return this.repository.listStatusLogsBySubject(currentUser.enterpriseId, subjectEmployeeId, {
      limit: clampLimit(query.limit),
      offset: normalizeOffset(query.offset),
    });
  }

  private async recordFailureAudit(
    subjectCount: number,
    auditContext: PlatformAuditContext,
  ): Promise<void> {
    try {
      await this.repository.recordAuditLog({
        actorUserId: auditContext.actorUserId,
        actorAccount: auditContext.actorAccount,
        action: 'platform.status-log.create',
        resourceType: 'platform.status-log',
        resourceId: undefined,
        traceId: auditContext.traceId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
        result: 'failure',
        metadata: {
          subjectCount,
          reason: 'request_rejected',
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record rejected status-log audit: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 20;
  }
  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

function normalizeOffset(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(Math.trunc(value), 0);
}
