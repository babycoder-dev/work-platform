import { describe, expect, it } from 'vitest';
import { MemoryEventBus } from './memory-event-bus';

describe('MemoryEventBus', () => {
  it('publishes events to subscribed handlers', async () => {
    const bus = new MemoryEventBus();
    const received: unknown[] = [];

    bus.subscribe('platform.user.created', (event) => {
      received.push(event.payload);
    });

    const event = await bus.publish({
      type: 'platform.user.created',
      source: 'platform-api',
      payload: {
        userId: 'user-001',
      },
    });

    expect(event.id).toBeTruthy();
    expect(event.occurredAt).toBeTruthy();
    expect(received).toEqual([{ userId: 'user-001' }]);
  });
});
