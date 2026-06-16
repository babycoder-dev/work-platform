import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryNotificationRepository } from '../db/in-memory-notification.repository';
import { notificationStreamEventTypes } from '../stream/notification-stream.events';
import type { NotificationStreamRegistry } from '../stream/notification-stream.registry';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  it('creates one in-app notification per unique recipient and marks own notifications read', async () => {
    const streamRegistry = createStreamRegistrySpy();
    const service = new NotificationService(new InMemoryNotificationRepository(), streamRegistry);

    const created = await service.create({
      recipientUserIds: ['user-1', 'user-1', 'user-2'],
      title: '审批提醒',
      content: '你有新的待处理事项',
      sourceModule: 'approval',
      sourceId: 'source-1',
    });

    expect(created.items).toHaveLength(2);
    expect(created.items[0]).toEqual(
      expect.objectContaining({
        recipientUserId: 'user-1',
        channel: 'in_app',
        sourceModule: 'approval',
      }),
    );

    await expect(service.unreadCount('user-1')).resolves.toEqual({ count: 1 });
    await expect(service.markRead('user-2', created.items[0].id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const read = await service.markRead('user-1', created.items[0].id);
    expect(read.readAt).toEqual(expect.any(String));
    await expect(service.unreadCount('user-1')).resolves.toEqual({ count: 0 });
  });

  it('emits one minimal created signal per unique recipient after create', async () => {
    const streamRegistry = createStreamRegistrySpy();
    const service = new NotificationService(new InMemoryNotificationRepository(), streamRegistry);

    await service.create({
      recipientUserIds: ['user-1', 'user-1', 'user-2'],
      title: '审批提醒',
      content: '你有新的待处理事项',
      sourceModule: 'approval',
      sourceId: 'source-1',
    });

    expect(streamRegistry.emitToUser).toHaveBeenCalledTimes(2);
    expect(streamRegistry.emitToUser).toHaveBeenNthCalledWith(1, 'user-1', {
      data: { type: notificationStreamEventTypes.created },
    });
    expect(streamRegistry.emitToUser).toHaveBeenNthCalledWith(2, 'user-2', {
      data: { type: notificationStreamEventTypes.created },
    });
    for (const [, event] of streamRegistry.emitToUser.mock.calls) {
      expect(event.data).toEqual({ type: notificationStreamEventTypes.created });
      expect(JSON.stringify(event.data)).not.toContain('审批提醒');
      expect(JSON.stringify(event.data)).not.toContain('待处理事项');
    }
  });
});

function createStreamRegistrySpy() {
  return {
    emitToUser: vi.fn(),
  } as unknown as NotificationStreamRegistry & {
    emitToUser: ReturnType<typeof vi.fn>;
  };
}
