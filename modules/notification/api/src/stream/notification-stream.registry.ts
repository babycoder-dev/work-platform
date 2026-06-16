import { Injectable, Logger } from '@nestjs/common';
import type { MessageEvent, OnModuleDestroy } from '@nestjs/common';
import { interval, merge, Subject, type Observable } from 'rxjs';
import { finalize, map, takeUntil } from 'rxjs/operators';
import { notificationStreamEventTypes } from './notification-stream.events';

const KEEPALIVE_MS = 25_000;

// Process-local connection table. In multi-replica deployments, each replica can only
// fan out to connections attached to that process; shared fan-out via Postgres
// LISTEN/NOTIFY or Redis pub/sub is reserved for the multi-replica milestone.
@Injectable()
export class NotificationStreamRegistry implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationStreamRegistry.name);
  private readonly connections = new Map<string, Set<Subject<MessageEvent>>>();
  private readonly destroyed$ = new Subject<void>();

  connect(userId: string): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    let userConnections = this.connections.get(userId);
    if (!userConnections) {
      userConnections = new Set();
      this.connections.set(userId, userConnections);
    }
    userConnections.add(subject);

    const keepalive$ = interval(KEEPALIVE_MS).pipe(
      map(() => ({ data: { type: notificationStreamEventTypes.keepalive } })),
    );

    return merge(subject.asObservable(), keepalive$).pipe(
      takeUntil(this.destroyed$),
      finalize(() => this.remove(userId, subject)),
    );
  }

  emitToUser(userId: string, event: MessageEvent): void {
    const userConnections = this.connections.get(userId);
    if (!userConnections) {
      return;
    }
    // Push is best-effort: a single broken connection must not interrupt fan-out to
    // this user's other connections, nor let the error bubble up to create(). Snapshot
    // the set first so a synchronous unsubscribe during next() cannot break the loop.
    for (const subject of [...userConnections]) {
      try {
        subject.next(event);
      } catch (error) {
        this.logger.warn(
          `Failed to emit notification signal to user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  getConnectionCount(userId: string): number {
    return this.connections.get(userId)?.size ?? 0;
  }

  onModuleDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
    for (const subjects of this.connections.values()) {
      for (const subject of subjects) {
        subject.complete();
      }
    }
    this.connections.clear();
  }

  private remove(userId: string, subject: Subject<MessageEvent>): void {
    const userConnections = this.connections.get(userId);
    if (!userConnections) {
      return;
    }
    userConnections.delete(subject);
    if (userConnections.size === 0) {
      this.connections.delete(userId);
    }
  }
}
