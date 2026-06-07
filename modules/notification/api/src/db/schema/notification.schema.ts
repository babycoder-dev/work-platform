import type { NotificationChannel } from '@work/notification-contract';

export interface NotificationRecord {
  id: string;
  recipientUserId: string;
  title: string;
  content: string;
  sourceModule?: string;
  sourceId?: string;
  channel: NotificationChannel;
  readAt?: Date;
  createdAt: Date;
}
