import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '@work/event-bus';
import type {
  CurrentUserDto,
  PlatformAuditPort,
  PlatformScopePort,
} from '@work/platform-contract';
import { PLATFORM_AUDIT_SERVICE, PLATFORM_SCOPE_SERVICE } from '@work/platform-contract';
import type {
  CreatePresenceStatusRecordInput,
  PresenceStatusRecordDto,
} from '@work/presence-contract';
import {
  presenceEvents,
  presencePermissions,
  type PresenceStatusChangedEvent,
} from '@work/presence-contract';
import { PRESENCE_REPOSITORY } from '../db/presence-repository.token';
import type { PresenceRepository, PresenceRepositoryActorContext } from '../db/presence.repository';

export interface PresenceAuditContext {
  traceId?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class PresenceStatusService {
  constructor(
    @Inject(PRESENCE_REPOSITORY) private readonly repository: PresenceRepository,
    @Inject(PLATFORM_SCOPE_SERVICE) private readonly scopeService: PlatformScopePort,
    @Inject(PLATFORM_AUDIT_SERVICE) private readonly auditService: PlatformAuditPort,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
  ) {}

  async getBoard(currentUser: CurrentUserDto): Promise<{ items: PresenceStatusRecordDto[] }> {
    const scope = await this.scopeService.resolveScope(currentUser, 'presence');
    const at = new Date().toISOString();

    let query;
    if (scope.kind === 'self') {
      query = { enterpriseId: scope.enterpriseId, at, userIds: [scope.userId] };
    } else if (scope.kind === 'company') {
      query = { enterpriseId: scope.enterpriseId, at };
    } else {
      query = { enterpriseId: scope.enterpriseId, at, departmentIds: scope.departmentIds };
    }

    const items = await this.repository.listActiveRecords(query);
    return { items };
  }

  async listOwnRecords(currentUser: CurrentUserDto): Promise<{ items: PresenceStatusRecordDto[] }> {
    const items = await this.repository.listUserRecords(currentUser.enterpriseId, currentUser.id);
    return { items };
  }

  async createRecord(
    currentUser: CurrentUserDto,
    input: CreatePresenceStatusRecordInput,
    auditContext: PresenceAuditContext,
  ): Promise<PresenceStatusRecordDto> {
    if (currentUser.departmentId === undefined || currentUser.departmentName === undefined) {
      throw new ForbiddenException('当前用户缺少部门信息，无法登记在位状态');
    }

    const overlap = await this.repository.findOverlappingRecord({
      enterpriseId: currentUser.enterpriseId,
      userId: currentUser.id,
      startAt: input.startAt,
      endAt: input.endAt,
    });
    if (overlap !== undefined) {
      throw new ConflictException('已存在重叠的在位状态记录');
    }

    const actor: PresenceRepositoryActorContext = {
      enterpriseId: currentUser.enterpriseId,
      userId: currentUser.id,
      employeeNo: currentUser.employeeNo,
      userName: currentUser.name,
      departmentId: currentUser.departmentId,
      departmentName: currentUser.departmentName,
    };

    const record = await this.repository.createRecord(input, actor);

    await this.auditService.record({
      actorUserId: currentUser.id,
      actorAccount: currentUser.account,
      action: 'presence.status.create',
      resourceType: 'presence.status_record',
      resourceId: record.id,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'success',
      metadata: {
        targetUserId: record.userId,
        status: record.status,
        startAt: record.startAt,
        endAt: record.endAt,
      },
    });

    await this.eventBus.publish<PresenceStatusChangedEvent>({
      type: presenceEvents.statusChanged,
      source: 'presence.api',
      traceId: auditContext.traceId,
      payload: {
        userId: record.userId,
        status: record.status,
        startAt: record.startAt,
        endAt: record.endAt,
        changedBy: currentUser.id,
      },
    });

    return record;
  }

  async cancelRecord(
    currentUser: CurrentUserDto,
    recordId: string,
    auditContext: PresenceAuditContext,
  ): Promise<PresenceStatusRecordDto> {
    const existing = (await this.repository.listUserRecords(currentUser.enterpriseId, currentUser.id))
      .find((row) => row.id === recordId);
    const isManager = currentUser.permissions.some(
      (permission) => permission.code === presencePermissions.statusManage,
    );
    if (existing === undefined && !isManager) {
      throw new ForbiddenException('无权取消该记录');
    }

    const cancelled = await this.repository.cancelRecord({
      recordId,
      actorUserId: currentUser.id,
      cancelledAt: new Date().toISOString(),
    });
    if (cancelled === undefined) {
      throw new NotFoundException('记录不存在或已取消');
    }

    await this.auditService.record({
      actorUserId: currentUser.id,
      actorAccount: currentUser.account,
      action: 'presence.status.cancel',
      resourceType: 'presence.status_record',
      resourceId: cancelled.id,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'success',
      metadata: {
        targetUserId: cancelled.userId,
        status: cancelled.status,
        startAt: cancelled.startAt,
        endAt: cancelled.endAt,
      },
    });

    await this.eventBus.publish<PresenceStatusChangedEvent>({
      type: presenceEvents.statusChanged,
      source: 'presence.api',
      traceId: auditContext.traceId,
      payload: {
        userId: cancelled.userId,
        status: cancelled.status,
        startAt: cancelled.startAt,
        endAt: cancelled.endAt,
        changedBy: currentUser.id,
      },
    });

    return cancelled;
  }
}
