import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUserDto, PlatformAuditPort } from '@work/platform-contract';
import { PLATFORM_AUDIT_SERVICE } from '@work/platform-contract';
import type {
  CreatePresenceStatusTypeInput,
  PresenceStatusTypeDto,
  UpdatePresenceStatusTypeInput,
} from '@work/presence-contract';
import { PRESENCE_REPOSITORY } from '../db/presence-repository.token';
import type { PresenceRepository } from '../db/presence.repository';
import type { PresenceAuditContext } from '../status/presence-status.service';

@Injectable()
export class PresenceStatusTypeService {
  constructor(
    @Inject(PRESENCE_REPOSITORY) private readonly repository: PresenceRepository,
    @Inject(PLATFORM_AUDIT_SERVICE) private readonly auditService: PlatformAuditPort,
  ) {}

  async listActive(enterpriseId: string): Promise<PresenceStatusTypeDto[]> {
    await this.repository.ensurePresetStatusTypes(enterpriseId);
    return this.repository.listStatusTypes(enterpriseId, { includeArchived: false });
  }

  async listAll(enterpriseId: string): Promise<PresenceStatusTypeDto[]> {
    await this.repository.ensurePresetStatusTypes(enterpriseId);
    return this.repository.listStatusTypes(enterpriseId, { includeArchived: true });
  }

  async create(
    currentUser: CurrentUserDto,
    input: CreatePresenceStatusTypeInput,
    auditContext: PresenceAuditContext,
  ): Promise<PresenceStatusTypeDto> {
    await this.repository.ensurePresetStatusTypes(currentUser.enterpriseId);
    if (await this.repository.findStatusTypeByKey(currentUser.enterpriseId, input.key)) {
      throw new ConflictException('状态类型 key 已存在');
    }
    const created = await this.repository.createStatusType({
      enterpriseId: currentUser.enterpriseId,
      key: input.key,
      label: input.label,
      sortOrder: input.sortOrder ?? 0,
      createdBy: currentUser.id,
    });
    await this.recordAudit(currentUser, auditContext, 'create', created, undefined, created);
    return created;
  }

  async update(
    currentUser: CurrentUserDto,
    id: string,
    input: UpdatePresenceStatusTypeInput,
    auditContext: PresenceAuditContext,
  ): Promise<PresenceStatusTypeDto> {
    if (input.label === undefined && input.sortOrder === undefined) {
      throw new BadRequestException('至少提供 label 或 sortOrder');
    }
    const before = await this.getOwned(currentUser.enterpriseId, id);
    const updated = await this.repository.updateStatusType(currentUser.enterpriseId, id, input);
    if (!updated) throw new NotFoundException('状态类型不存在');
    await this.recordAudit(currentUser, auditContext, 'update', updated, before, updated);
    return updated;
  }

  async setDefault(
    currentUser: CurrentUserDto,
    id: string,
    auditContext: PresenceAuditContext,
  ): Promise<PresenceStatusTypeDto> {
    const before = await this.getOwned(currentUser.enterpriseId, id);
    if (before.status !== 'active') {
      throw new ConflictException('已停用状态类型不能设为缺省');
    }
    const updated = await this.repository.setDefaultStatusType(currentUser.enterpriseId, id);
    if (!updated) throw new NotFoundException('状态类型不存在');
    await this.recordAudit(currentUser, auditContext, 'set-default', updated, before, updated);
    return updated;
  }

  async archive(
    currentUser: CurrentUserDto,
    id: string,
    auditContext: PresenceAuditContext,
  ): Promise<PresenceStatusTypeDto> {
    const before = await this.getOwned(currentUser.enterpriseId, id);
    if (before.isDefault) throw new ConflictException('缺省状态类型不能停用');
    if (before.status === 'archived') throw new ConflictException('状态类型已停用');
    const updated = await this.repository.setStatusTypeStatus(
      currentUser.enterpriseId,
      id,
      'archived',
    );
    if (!updated) throw new ConflictException('缺省状态类型不能停用');
    await this.recordAudit(currentUser, auditContext, 'archive', updated, before, updated);
    return updated;
  }

  async restore(
    currentUser: CurrentUserDto,
    id: string,
    auditContext: PresenceAuditContext,
  ): Promise<PresenceStatusTypeDto> {
    const before = await this.getOwned(currentUser.enterpriseId, id);
    if (before.status === 'active') throw new ConflictException('状态类型已启用');
    const updated = await this.repository.setStatusTypeStatus(
      currentUser.enterpriseId,
      id,
      'active',
    );
    if (!updated) throw new NotFoundException('状态类型不存在');
    await this.recordAudit(currentUser, auditContext, 'restore', updated, before, updated);
    return updated;
  }

  private async getOwned(enterpriseId: string, id: string): Promise<PresenceStatusTypeDto> {
    await this.repository.ensurePresetStatusTypes(enterpriseId);
    const type = await this.repository.findStatusTypeById(enterpriseId, id);
    if (!type) throw new NotFoundException('状态类型不存在');
    return type;
  }

  private async recordAudit(
    currentUser: CurrentUserDto,
    context: PresenceAuditContext,
    action: string,
    resource: PresenceStatusTypeDto,
    before?: PresenceStatusTypeDto,
    after?: PresenceStatusTypeDto,
  ): Promise<void> {
    await this.auditService.record({
      actorUserId: currentUser.id,
      actorAccount: currentUser.account,
      action: `presence.status-type.${action}`,
      resourceType: 'presence.status_type',
      resourceId: resource.id,
      traceId: context.traceId,
      ip: context.ip,
      userAgent: context.userAgent,
      result: 'success',
      metadata: {
        key: resource.key,
        before: before
          ? {
              label: before.label,
              sortOrder: before.sortOrder,
              status: before.status,
              isDefault: before.isDefault,
            }
          : undefined,
        after: after
          ? {
              label: after.label,
              sortOrder: after.sortOrder,
              status: after.status,
              isDefault: after.isDefault,
            }
          : undefined,
      },
    });
  }
}
