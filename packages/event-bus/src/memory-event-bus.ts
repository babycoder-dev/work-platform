import type { DomainEvent, DomainEventHandler, EventBus } from './domain-event';

export class MemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<DomainEventHandler>>();

  async publish<TPayload>(
    event: Omit<DomainEvent<TPayload>, 'id' | 'occurredAt'>,
  ): Promise<DomainEvent<TPayload>> {
    const domainEvent: DomainEvent<TPayload> = {
      ...event,
      id: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
    };

    const handlers = this.handlers.get(domainEvent.type) ?? new Set();
    await Promise.all(Array.from(handlers).map((handler) => handler(domainEvent)));

    return domainEvent;
  }

  subscribe<TPayload>(type: string, handler: DomainEventHandler<TPayload>): () => void {
    const handlers = this.handlers.get(type) ?? new Set();
    handlers.add(handler as DomainEventHandler);
    this.handlers.set(type, handlers);

    return () => {
      handlers.delete(handler as DomainEventHandler);
    };
  }
}
