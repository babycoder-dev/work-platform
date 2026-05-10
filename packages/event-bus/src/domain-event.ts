export interface DomainEvent<TPayload = unknown> {
  id: string;
  type: string;
  source: string;
  occurredAt: string;
  payload: TPayload;
  traceId?: string;
}

export type DomainEventHandler<TPayload = unknown> = (event: DomainEvent<TPayload>) => void | Promise<void>;

export interface EventBus {
  publish<TPayload>(event: Omit<DomainEvent<TPayload>, 'id' | 'occurredAt'>): Promise<DomainEvent<TPayload>>;
  subscribe<TPayload>(type: string, handler: DomainEventHandler<TPayload>): () => void;
}
