import { describe, expect, it } from 'vitest';
import { InMemoryNotificationRepository } from './in-memory-notification.repository';

describe('InMemoryNotificationRepository', () => {
  it('lists, counts and marks only the requested recipient notifications', async () => {
    const repository = new InMemoryNotificationRepository();
    await repository.createMany([
      record('n-1', 'user-1', new Date('2026-06-01T00:00:00Z')),
      record('n-2', 'user-1', new Date('2026-06-02T00:00:00Z')),
      record('n-3', 'user-2', new Date('2026-06-03T00:00:00Z')),
    ]);

    await expect(repository.countUnread('user-1')).resolves.toBe(2);
    await expect(
      repository.listByRecipient('user-1', { limit: 20, offset: 0 }),
    ).resolves.toMatchObject({
      total: 2,
      items: [{ id: 'n-2' }, { id: 'n-1' }],
    });

    await expect(
      repository.markRead('user-1', 'n-3', new Date('2026-06-04T00:00:00Z')),
    ).resolves.toBeUndefined();

    await repository.markRead('user-1', 'n-1', new Date('2026-06-04T00:00:00Z'));
    await expect(repository.countUnread('user-1')).resolves.toBe(1);
    await expect(
      repository.listByRecipient('user-1', { limit: 20, offset: 0, unreadOnly: true }),
    ).resolves.toMatchObject({
      total: 1,
      items: [{ id: 'n-2' }],
    });

    await expect(repository.markAllRead('user-1', new Date('2026-06-05T00:00:00Z'))).resolves.toBe(
      1,
    );
    await expect(repository.countUnread('user-1')).resolves.toBe(0);
  });
});

function record(id: string, recipientUserId: string, createdAt: Date) {
  return {
    id,
    recipientUserId,
    title: `title-${id}`,
    content: `content-${id}`,
    channel: 'in_app' as const,
    createdAt,
  };
}
