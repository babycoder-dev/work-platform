import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '@work/event-bus';
import type {
  CurrentUserDto,
  EmployeeLookupDto,
  PlatformEmployeeLookupPort,
  PlatformAuditPort,
  PlatformScopePort,
} from '@work/platform-contract';
import {
  PLATFORM_AUDIT_SERVICE,
  PLATFORM_EMPLOYEE_LOOKUP_SERVICE,
  PLATFORM_SCOPE_SERVICE,
} from '@work/platform-contract';
import type {
  CreatePresenceStatusRecordInput,
  PresenceBoardEntryDto,
  PresenceStatusRecordDto,
} from '@work/presence-contract';
import {
  presenceEvents,
  presencePermissions,
  type PresenceStatusChangedEvent,
} from '@work/presence-contract';
import { PRESENCE_REPOSITORY } from '../db/presence-repository.token';
import type { PresenceRepository, PresenceRepositoryActorContext } from '../db/presence.repository';
import {
  PRESENCE_FORMS_LINK,
  type PresenceFormsLinkPort,
} from '../forms-link/presence-forms-link.port';

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
    @Inject(PLATFORM_EMPLOYEE_LOOKUP_SERVICE)
    private readonly employeeLookup: PlatformEmployeeLookupPort,
    @Inject(PLATFORM_AUDIT_SERVICE) private readonly auditService: PlatformAuditPort,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Optional()
    @Inject(PRESENCE_FORMS_LINK)
    private readonly formsLink?: PresenceFormsLinkPort,
  ) {}

  async getBoard(currentUser: CurrentUserDto): Promise<{ items: PresenceBoardEntryDto[] }> {
    const scope = await this.scopeService.resolveScope(currentUser, 'presence');
    const at = new Date().toISOString();

    let statusTypes = await this.repository.listStatusTypes(currentUser.enterpriseId, {
      includeArchived: false,
    });
    let defaultType = statusTypes.find((type) => type.isDefault);
    if (defaultType === undefined) {
      await this.repository.ensurePresetStatusTypes(currentUser.enterpriseId);
      statusTypes = await this.repository.listStatusTypes(currentUser.enterpriseId, {
        includeArchived: false,
      });
      defaultType = statusTypes.find((type) => type.isDefault);
    }
    if (defaultType === undefined) {
      throw new BadRequestException('企业缺少有效的缺省状态类型');
    }
    const labelByKey = new Map(statusTypes.map((type) => [type.key, type.label]));

    let roster: EmployeeLookupDto[];
    if (scope.kind === 'self') {
      roster = await this.employeeLookup.listEmployeesByIds(scope.enterpriseId, [scope.userId]);
    } else if (scope.kind === 'company') {
      roster = await this.employeeLookup.listEmployeesByScope(scope.enterpriseId);
    } else {
      roster = await this.employeeLookup.listEmployeesByScope(
        scope.enterpriseId,
        scope.departmentIds,
      );
    }

    if (roster.length === 0) {
      return { items: [] };
    }

    const records = await this.repository.listActiveRecords({
      enterpriseId: scope.enterpriseId,
      at,
      userIds: roster.map((employee) => employee.id),
    });
    // listActiveRecords is newest-first; keep the first row if legacy data overlaps.
    const recordByUser = new Map<string, PresenceStatusRecordDto>();
    for (const record of records) {
      if (!recordByUser.has(record.userId)) {
        recordByUser.set(record.userId, record);
      }
    }
    const items = roster.map((employee): PresenceBoardEntryDto => {
      const record = recordByUser.get(employee.id);
      if (record === undefined) {
        return {
          userId: employee.id,
          employeeNo: employee.employeeNo,
          userName: employee.name,
          departmentId: employee.departmentId,
          departmentName: employee.departmentName,
          status: defaultType.key,
          statusLabel: defaultType.label,
          isDefault: true,
        };
      }
      return {
        userId: employee.id,
        employeeNo: employee.employeeNo,
        userName: employee.name,
        departmentId: employee.departmentId,
        departmentName: employee.departmentName,
        status: record.status,
        statusLabel: labelByKey.get(record.status) ?? record.status,
        isDefault: false,
        startAt: record.startAt,
        endAt: record.endAt,
        remark: record.remark,
        recordId: record.id,
        formRecordId: record.formRecordId,
      };
    });
    return { items };
  }

  async getEmployeeStatus(
    currentUser: CurrentUserDto,
    employeeId: string,
  ): Promise<{ record: PresenceStatusRecordDto | null }> {
    const scope = await this.scopeService.resolveScope(currentUser, 'presence');
    const [subject] = await this.employeeLookup.listEmployeesByIds(currentUser.enterpriseId, [
      employeeId,
    ]);
    if (!subject) {
      return { record: null };
    }

    if (
      !this.scopeService.matchesScope(
        {
          id: employeeId,
          enterpriseId: currentUser.enterpriseId,
          departmentId: subject.departmentId,
        },
        scope,
      )
    ) {
      return { record: null };
    }

    const [record] = await this.repository.listActiveRecords({
      enterpriseId: scope.enterpriseId,
      at: new Date().toISOString(),
      userIds: [employeeId],
    });
    return { record: record ?? null };
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
    if (
      input.endAt !== undefined &&
      new Date(input.endAt).getTime() <= new Date(input.startAt).getTime()
    ) {
      throw new BadRequestException('结束时间必须晚于开始时间');
    }

    await this.repository.ensurePresetStatusTypes(currentUser.enterpriseId);
    const statusType = await this.repository.findStatusTypeByKey(
      currentUser.enterpriseId,
      input.status,
    );
    if (!statusType || statusType.status !== 'active') {
      throw new BadRequestException('状态类型不存在或已停用');
    }
    if (statusType.isDefault) {
      throw new BadRequestException('缺省状态（在岗）无需登记');
    }
    const defaultType = (
      await this.repository.listStatusTypes(currentUser.enterpriseId, {
        includeArchived: false,
      })
    ).find((type) => type.isDefault);
    if (!defaultType) {
      throw new BadRequestException('企业缺少有效的缺省状态类型');
    }

    const overlap = await this.repository.findOverlappingRecord({
      enterpriseId: currentUser.enterpriseId,
      userId: currentUser.id,
      startAt: input.startAt,
      endAt: input.endAt,
      exemptStatusKey: defaultType.key,
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

    let formRecordId: string | undefined;
    if (input.form !== undefined) {
      if (
        typeof input.form !== 'object' ||
        input.form === null ||
        typeof input.form.definitionRevision !== 'number' ||
        !Number.isFinite(input.form.definitionRevision) ||
        !Array.isArray(input.form.values)
      ) {
        throw new BadRequestException('表单填报参数格式错误');
      }
      if (this.formsLink === undefined) {
        throw new InternalServerErrorException('在位登记填报服务未就绪');
      }
      ({ recordId: formRecordId } = await this.formsLink.createStatusFormRecord(
        currentUser,
        {
          slotKey: `presence.status.${statusType.key}`,
          definitionRevision: input.form.definitionRevision,
          values: input.form.values,
        },
        {
          traceId: auditContext.traceId,
          ip: auditContext.ip,
          userAgent: auditContext.userAgent,
        },
      ));
    }

    const record =
      formRecordId === undefined
        ? await this.repository.createRecord(input, actor)
        : await this.repository.createRecord(input, actor, { formRecordId });

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
        formRecordId,
      },
    });

    await this.eventBus.publish<PresenceStatusChangedEvent>({
      type: presenceEvents.statusChanged,
      source: 'presence.api',
      traceId: auditContext.traceId,
      payload: {
        recordId: record.id,
        enterpriseId: currentUser.enterpriseId,
        userId: record.userId,
        status: record.status,
        statusLabel: statusType.label,
        startAt: record.startAt,
        endAt: record.endAt,
        changedBy: currentUser.id,
        changeKind: 'created',
      },
    });

    return record;
  }

  async cancelRecord(
    currentUser: CurrentUserDto,
    recordId: string,
    auditContext: PresenceAuditContext,
  ): Promise<PresenceStatusRecordDto> {
    await this.repository.ensurePresetStatusTypes(currentUser.enterpriseId);
    const existing = (
      await this.repository.listUserRecords(currentUser.enterpriseId, currentUser.id)
    ).find((row) => row.id === recordId);
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
        recordId: cancelled.id,
        enterpriseId: currentUser.enterpriseId,
        userId: cancelled.userId,
        status: cancelled.status,
        statusLabel:
          (await this.repository.findStatusTypeByKey(currentUser.enterpriseId, cancelled.status))
            ?.label ?? cancelled.status,
        startAt: cancelled.startAt,
        endAt: cancelled.endAt,
        changedBy: currentUser.id,
        changeKind: 'cancelled',
      },
    });

    return cancelled;
  }
}
