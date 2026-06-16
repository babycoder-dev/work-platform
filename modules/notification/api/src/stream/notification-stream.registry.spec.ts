import { describe, expect, it, vi } from 'vitest';
import { notificationStreamEventTypes } from './notification-stream.events';
import { NotificationStreamRegistry } from './notification-stream.registry';

describe('NotificationStreamRegistry', () => {
  it('emits only to the requested user and treats missing users as no-op', () => {
    const registry = new NotificationStreamRegistry();
    const received: unknown[] = [];

    const subscription = registry.connect('user-a').subscribe((event) => received.push(event.data));

    registry.emitToUser('user-b', { data: { type: notificationStreamEventTypes.created } });
    registry.emitToUser('user-a', { data: { type: notificationStreamEventTypes.created } });
    registry.emitToUser('missing-user', { data: { type: notificationStreamEventTypes.created } });

    expect(received).toEqual([{ type: notificationStreamEventTypes.created }]);
    subscription.unsubscribe();
  });

  it('supports multiple connections for the same user and cleans them up on unsubscribe', () => {
    const registry = new NotificationStreamRegistry();
    const first: unknown[] = [];
    const second: unknown[] = [];

    const firstSubscription = registry.connect('user-a').subscribe((event) => first.push(event.data));
    const secondSubscription = registry.connect('user-a').subscribe((event) => second.push(event.data));
    expect(registry.getConnectionCount('user-a')).toBe(2);

    registry.emitToUser('user-a', { data: { type: notificationStreamEventTypes.created } });
    expect(first).toEqual([{ type: notificationStreamEventTypes.created }]);
    expect(second).toEqual([{ type: notificationStreamEventTypes.created }]);

    firstSubscription.unsubscribe();
    expect(registry.getConnectionCount('user-a')).toBe(1);
    secondSubscription.unsubscribe();
    expect(registry.getConnectionCount('user-a')).toBe(0);
  });

  it('sends per-connection keepalive events and stops them after unsubscribe', () => {
    vi.useFakeTimers();
    try {
      const registry = new NotificationStreamRegistry();
      const received: unknown[] = [];
      const subscription = registry.connect('user-a').subscribe((event) => received.push(event.data));

      vi.advanceTimersByTime(24_999);
      expect(received).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(received).toEqual([{ type: notificationStreamEventTypes.keepalive }]);

      subscription.unsubscribe();
      vi.advanceTimersByTime(25_000);
      expect(received).toEqual([{ type: notificationStreamEventTypes.keepalive }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('completes and clears all connections when destroyed', () => {
    const registry = new NotificationStreamRegistry();
    let completed = false;
    registry.connect('user-a').subscribe({ complete: () => (completed = true) });

    registry.onModuleDestroy();

    expect(completed).toBe(true);
    expect(registry.getConnectionCount('user-a')).toBe(0);
  });
});
