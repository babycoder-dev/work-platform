import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS, type DomainEvent, type EventBus } from '@work/event-bus';
import { notificationTriggerKeys } from '@work/notification-contract';
import { platformEvents, type ProfileUpdatedPayload } from '@work/platform-contract';
import { NOTIFICATION_TRIGGER_CONFIG_REPOSITORY } from '../db/trigger-config-repository.token';
import type { TriggerConfigRepository } from '../db/trigger-config.repository';
import { NotificationService } from '../notification/notification.service';
import { RecipientResolver } from '../recipient/recipient-resolver';

interface PresenceStatusChangedPayload {
  recordId: string;
  enterpriseId: string;
  userId: string;
  status: 'working' | 'business_trip' | 'field_research' | 'out' | 'leave';
  startAt: string;
  endAt?: string;
  changedBy: string;
  changeKind: 'created' | 'cancelled';
}

@Injectable()
export class NotificationEventSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationEventSubscriber.name);
  private unsubscribePresence?: () => void;
  private unsubscribeProfile?: () => void;

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(NOTIFICATION_TRIGGER_CONFIG_REPOSITORY)
    private readonly triggerConfigRepository: TriggerConfigRepository,
    @Inject(RecipientResolver) private readonly recipientResolver: RecipientResolver,
    @Inject(NotificationService) private readonly notificationService: NotificationService,
  ) {}

  onModuleInit(): void {
    this.unsubscribePresence = this.eventBus.subscribe<PresenceStatusChangedPayload>(
      notificationTriggerKeys.presenceStatusChanged,
      (event) => this.handlePresenceStatusChanged(event),
    );
    this.unsubscribeProfile = this.eventBus.subscribe<ProfileUpdatedPayload>(
      platformEvents.profileUpdated,
      (event) => this.handleProfileUpdated(event),
    );
  }

  onModuleDestroy(): void {
    this.unsubscribePresence?.();
    this.unsubscribePresence = undefined;
    this.unsubscribeProfile?.();
    this.unsubscribeProfile = undefined;
  }

  private async handlePresenceStatusChanged(
    event: DomainEvent<PresenceStatusChangedPayload>,
  ): Promise<void> {
    try {
      const config = await this.triggerConfigRepository.findTriggerConfig(event.type);
      if (!config?.enabled) {
        return;
      }

      const recipientUserIds = await this.recipientResolver.resolve(config.defaultRecipients, {
        enterpriseId: event.payload.enterpriseId,
        subjectUserId: event.payload.userId,
        actorUserId: event.payload.changedBy,
      });
      if (recipientUserIds.length === 0) {
        return;
      }

      await this.notificationService.create({
        recipientUserIds,
        title: '在位状态变更',
        content: buildPresenceContent(event.payload),
        sourceModule: 'presence',
        sourceId: event.payload.recordId,
        channel: 'in_app',
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle notification trigger ${event.type}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleProfileUpdated(event: DomainEvent<ProfileUpdatedPayload>): Promise<void> {
    try {
      await this.notificationService.create({
        recipientUserIds: [event.payload.subjectUserId],
        title: '个人信息变更',
        content: '你的个人信息已被更新，请查看个人档案。',
        sourceModule: 'platform',
        sourceId: event.payload.subjectUserId,
        channel: 'in_app',
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle ${event.type}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function buildPresenceContent(payload: PresenceStatusChangedPayload): string {
  const action = payload.changeKind === 'cancelled' ? '取消了' : '登记了';
  return `有团队成员${action}${formatPresenceStatus(payload.status)}状态，请查看在位看板`;
}

function formatPresenceStatus(status: PresenceStatusChangedPayload['status']): string {
  const labels: Record<PresenceStatusChangedPayload['status'], string> = {
    working: '在岗',
    business_trip: '出差',
    field_research: '外出调研',
    out: '外出',
    leave: '休假',
  };
  return labels[status] ?? status;
}
