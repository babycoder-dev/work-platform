import { Inject, Injectable } from '@nestjs/common';
import type { PlatformAuditPort } from '@work/platform-contract';
import { PLATFORM_AUDIT_SERVICE } from '@work/platform-contract';
import type { AuthAuditContext, CurrentUserAuthSnapshot } from '@work/nest-common';
import type { TriggerConfigDto, UpdateTriggerConfigInput } from '@work/notification-contract';
import type { TriggerConfigRecord } from '../db/schema/trigger-config.schema';
import { NOTIFICATION_TRIGGER_CONFIG_REPOSITORY } from '../db/trigger-config-repository.token';
import type { TriggerConfigRepository } from '../db/trigger-config.repository';

@Injectable()
export class TriggerConfigService {
  constructor(
    @Inject(NOTIFICATION_TRIGGER_CONFIG_REPOSITORY)
    private readonly repository: TriggerConfigRepository,
    @Inject(PLATFORM_AUDIT_SERVICE) private readonly auditService: PlatformAuditPort,
  ) {}

  async list(): Promise<{ items: TriggerConfigDto[] }> {
    const items = await this.repository.listTriggerConfigs();
    return { items: items.map(toDto) };
  }

  async upsert(
    triggerKey: string,
    input: UpdateTriggerConfigInput,
    actor: CurrentUserAuthSnapshot,
    auditContext: AuthAuditContext,
  ): Promise<TriggerConfigDto> {
    const before = await this.repository.findTriggerConfig(triggerKey);
    const updated = await this.repository.upsertTriggerConfig(triggerKey, input);

    await this.auditService.record({
      actorUserId: actor.id,
      actorAccount: actor.account,
      action: 'notification.trigger-config.update',
      resourceType: 'notification.trigger_config',
      resourceId: triggerKey,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'success',
      metadata: {
        before: before ? toDto(before) : undefined,
        after: toDto(updated),
      },
    });

    return toDto(updated);
  }
}

function toDto(record: TriggerConfigRecord): TriggerConfigDto {
  return {
    triggerKey: record.triggerKey,
    enabled: record.enabled,
    defaultRecipients: record.defaultRecipients.map((recipient) => ({ ...recipient })),
    updatedAt: record.updatedAt.toISOString(),
  };
}
