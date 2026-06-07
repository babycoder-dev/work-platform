import type { NotificationChannel, ListNotificationsQuery } from '@work/notification-contract';
import type { NotificationRecord } from './schema/notification.schema';

export interface CreateNotificationRecordInput {
  id: string;
  recipientUserId: string;
  title: string;
  content: string;
  sourceModule?: string;
  sourceId?: string;
  channel: NotificationChannel;
  createdAt: Date;
}

export interface ListNotificationRecordsResult {
  items: NotificationRecord[];
  total: number;
}

export interface NotificationRepository {
  createMany(items: CreateNotificationRecordInput[]): Promise<NotificationRecord[]>;
  listByRecipient(
    recipientUserId: string,
    query: Required<Pick<ListNotificationsQuery, 'limit' | 'offset'>> &
      Pick<ListNotificationsQuery, 'unreadOnly'>,
  ): Promise<ListNotificationRecordsResult>;
  countUnread(recipientUserId: string): Promise<number>;
  markRead(
    recipientUserId: string,
    id: string,
    readAt: Date,
  ): Promise<NotificationRecord | undefined>;
  markAllRead(recipientUserId: string, readAt: Date): Promise<number>;
}
