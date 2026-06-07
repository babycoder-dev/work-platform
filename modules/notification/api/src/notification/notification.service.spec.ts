import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { InMemoryNotificationRepository } from '../db/in-memory-notification.repository';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  it('creates one in-app notification per unique recipient and marks own notifications read', async () => {
    const service = new NotificationService(new InMemoryNotificationRepository());

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
});
