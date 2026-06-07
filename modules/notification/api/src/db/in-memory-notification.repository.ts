import { Injectable } from '@nestjs/common';
import type {
  CreateNotificationRecordInput,
  NotificationRepository,
} from './notification.repository';
import type { NotificationRecord } from './schema/notification.schema';

@Injectable()
export class InMemoryNotificationRepository implements NotificationRepository {
  private readonly records = new Map<string, NotificationRecord>();

  async createMany(items: CreateNotificationRecordInput[]): Promise<NotificationRecord[]> {
    const records = items.map((item) => ({ ...item }));
    for (const record of records) {
      this.records.set(record.id, record);
    }
    return records.map((record) => ({ ...record }));
  }

  async listByRecipient(
    recipientUserId: string,
    query: { limit: number; offset: number; unreadOnly?: boolean },
  ) {
    const all = Array.from(this.records.values())
      .filter((record) => record.recipientUserId === recipientUserId)
      .filter((record) => !query.unreadOnly || record.readAt === undefined)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    return {
      items: all.slice(query.offset, query.offset + query.limit).map((record) => ({ ...record })),
      total: all.length,
    };
  }

  async countUnread(recipientUserId: string): Promise<number> {
    return Array.from(this.records.values()).filter(
      (record) => record.recipientUserId === recipientUserId && record.readAt === undefined,
    ).length;
  }

  async markRead(
    recipientUserId: string,
    id: string,
    readAt: Date,
  ): Promise<NotificationRecord | undefined> {
    const existing = this.records.get(id);
    if (!existing || existing.recipientUserId !== recipientUserId) {
      return undefined;
    }
    const updated = { ...existing, readAt };
    this.records.set(id, updated);
    return { ...updated };
  }

  async markAllRead(recipientUserId: string, readAt: Date): Promise<number> {
    let count = 0;
    for (const [id, record] of this.records.entries()) {
      if (record.recipientUserId !== recipientUserId || record.readAt !== undefined) {
        continue;
      }
      this.records.set(id, { ...record, readAt });
      count += 1;
    }
    return count;
  }
}
