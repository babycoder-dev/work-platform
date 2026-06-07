import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateNotificationInput,
  type ListNotificationsQuery,
  type NotificationDto,
  type NotificationServicePort,
} from '@work/notification-contract';
import { randomUUID } from 'node:crypto';
import { NOTIFICATION_REPOSITORY } from '../db/notification-repository.token';
import type { NotificationRepository } from '../db/notification.repository';
import type { NotificationRecord } from '../db/schema/notification.schema';

@Injectable()
export class NotificationService implements NotificationServicePort {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly repository: NotificationRepository,
  ) {}

  async create(input: CreateNotificationInput): Promise<{ items: NotificationDto[] }> {
    const recipientUserIds = Array.from(new Set(input.recipientUserIds));
    const createdAt = new Date();
    const records = await this.repository.createMany(
      recipientUserIds.map((recipientUserId) => ({
        id: randomUUID(),
        recipientUserId,
        title: input.title,
        content: input.content,
        sourceModule: input.sourceModule,
        sourceId: input.sourceId,
        channel: input.channel ?? 'in_app',
        createdAt,
      })),
    );

    return { items: records.map(toDto) };
  }

  async list(recipientUserId: string, query: ListNotificationsQuery = {}) {
    const result = await this.repository.listByRecipient(recipientUserId, {
      unreadOnly: query.unreadOnly,
      limit: clampLimit(query.limit),
      offset: normalizeOffset(query.offset),
    });

    return {
      items: result.items.map(toDto),
      total: result.total,
    };
  }

  async unreadCount(recipientUserId: string) {
    return { count: await this.repository.countUnread(recipientUserId) };
  }

  async markRead(recipientUserId: string, id: string): Promise<NotificationDto> {
    const record = await this.repository.markRead(recipientUserId, id, new Date());
    if (!record) {
      throw new NotFoundException('通知不存在');
    }
    return toDto(record);
  }

  async markAllRead(recipientUserId: string) {
    return { count: await this.repository.markAllRead(recipientUserId, new Date()) };
  }
}

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 20;
  }
  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

function normalizeOffset(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(Math.trunc(value), 0);
}

function toDto(record: NotificationRecord): NotificationDto {
  return {
    id: record.id,
    recipientUserId: record.recipientUserId,
    title: record.title,
    content: record.content,
    sourceModule: record.sourceModule,
    sourceId: record.sourceId,
    channel: record.channel,
    readAt: record.readAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}
