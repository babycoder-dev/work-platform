import type { EventBus } from '@work/event-bus';
import { MemoryEventBus } from '@work/event-bus';
import { notificationTriggerKeys } from '@work/notification-contract';
import { platformEvents, type ProfileUpdatedPayload } from '@work/platform-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TriggerConfigRepository } from '../db/trigger-config.repository';
import type { NotificationService } from '../notification/notification.service';
import type { RecipientResolver } from '../recipient/recipient-resolver';
import { NotificationEventSubscriber } from './notification-event.subscriber';

describe('NotificationEventSubscriber', () => {
  let eventBus: EventBus;
  let triggerConfigRepository: MockTriggerConfigRepository;
  let recipientResolver: MockRecipientResolver;
  let notificationService: MockNotificationService;
  let subscriber: NotificationEventSubscriber;

  beforeEach(() => {
    eventBus = new MemoryEventBus();
    triggerConfigRepository = {
      listTriggerConfigs: vi.fn(),
      findTriggerConfig: vi.fn(),
      upsertTriggerConfig: vi.fn(),
    };
    recipientResolver = {
      resolve: vi.fn(),
    };
    notificationService = {
      create: vi.fn(),
    };
    subscriber = new NotificationEventSubscriber(
      eventBus,
      triggerConfigRepository,
      recipientResolver as unknown as RecipientResolver,
      notificationService as unknown as NotificationService,
    );
    subscriber.onModuleInit();
  });

  it('skips disabled trigger configs', async () => {
    triggerConfigRepository.findTriggerConfig.mockResolvedValue({
      triggerKey: notificationTriggerKeys.presenceStatusChanged,
      enabled: false,
      defaultRecipients: [{ kind: 'department_manager' }],
      updatedAt: new Date(),
    });

    await publishPresenceEvent(eventBus);

    expect(recipientResolver.resolve).not.toHaveBeenCalled();
    expect(notificationService.create).not.toHaveBeenCalled();
  });

  it('creates in-app notifications for resolved recipients and differentiates created/cancelled copy', async () => {
    triggerConfigRepository.findTriggerConfig.mockResolvedValue({
      triggerKey: notificationTriggerKeys.presenceStatusChanged,
      enabled: true,
      defaultRecipients: [{ kind: 'department_manager' }],
      updatedAt: new Date(),
    });
    recipientResolver.resolve.mockResolvedValue(['manager-1']);

    await publishPresenceEvent(eventBus, { changeKind: 'created' });
    await publishPresenceEvent(eventBus, { recordId: 'record-2', changeKind: 'cancelled' });

    expect(notificationService.create).toHaveBeenNthCalledWith(1, {
      recipientUserIds: ['manager-1'],
      title: '在位状态变更',
      content: '有团队成员登记了出差状态，请查看在位看板',
      sourceModule: 'presence',
      sourceId: 'record-1',
      channel: 'in_app',
    });
    expect(notificationService.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        content: '有团队成员取消了出差状态，请查看在位看板',
        sourceId: 'record-2',
      }),
    );
  });

  it('swallows handler errors so publisher business flow is not affected', async () => {
    triggerConfigRepository.findTriggerConfig.mockRejectedValue(new Error('repository down'));

    await expect(publishPresenceEvent(eventBus)).resolves.toEqual(
      expect.objectContaining({ type: notificationTriggerKeys.presenceStatusChanged }),
    );
  });

  it('creates a direct in-app notification for profile.updated without trigger config or resolver', async () => {
    await publishProfileUpdatedEvent(eventBus, { changedFields: ['title'], subjectUserId: 'user-1' });

    expect(triggerConfigRepository.findTriggerConfig).not.toHaveBeenCalled();
    expect(recipientResolver.resolve).not.toHaveBeenCalled();
    expect(notificationService.create).toHaveBeenCalledWith({
      recipientUserIds: ['user-1'],
      title: '个人信息变更',
      content: '你的个人信息已被更新，请查看个人档案。',
      sourceModule: 'platform',
      sourceId: 'user-1',
      channel: 'in_app',
    });
    const createInput = notificationService.create.mock.calls[0]?.[0];
    expect(createInput.content).not.toContain('title');
    expect(createInput.content).not.toContain('新职务');
  });

  it('swallows profile.updated notification creation errors', async () => {
    notificationService.create.mockRejectedValue(new Error('notification store down'));

    await expect(publishProfileUpdatedEvent(eventBus)).resolves.toEqual(
      expect.objectContaining({ type: platformEvents.profileUpdated }),
    );
  });
});

async function publishPresenceEvent(
  eventBus: EventBus,
  overrides: Partial<PresenceStatusChangedPayload> = {},
) {
  return eventBus.publish<PresenceStatusChangedPayload>({
    type: notificationTriggerKeys.presenceStatusChanged,
    source: 'presence.api',
    payload: {
      recordId: 'record-1',
      enterpriseId: 'ent-1',
      userId: 'subject-1',
      status: 'business_trip',
      startAt: '2026-06-01T00:00:00.000Z',
      endAt: '2026-06-01T08:00:00.000Z',
      changedBy: 'actor-1',
      changeKind: 'created',
      ...overrides,
    },
  });
}

async function publishProfileUpdatedEvent(
  eventBus: EventBus,
  overrides: Partial<ProfileUpdatedPayload> = {},
) {
  return eventBus.publish<ProfileUpdatedPayload>({
    type: platformEvents.profileUpdated,
    source: 'platform.api',
    payload: {
      enterpriseId: 'ent-1',
      subjectUserId: 'subject-1',
      changedBy: 'actor-1',
      changedFields: ['mobile'],
      ...overrides,
    },
  });
}

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

type MockTriggerConfigRepository = {
  [K in keyof TriggerConfigRepository]: ReturnType<typeof vi.fn>;
};

interface MockRecipientResolver extends Pick<RecipientResolver, 'resolve'> {
  resolve: ReturnType<typeof vi.fn>;
}

interface MockNotificationService extends Pick<NotificationService, 'create'> {
  create: ReturnType<typeof vi.fn>;
}
