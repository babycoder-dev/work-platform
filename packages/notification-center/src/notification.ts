export type NotificationChannel = 'in_app' | 'im' | 'email' | 'sms';

export interface CreateNotificationInput {
  recipientUserIds: string[];
  title: string;
  content: string;
  sourceModule?: string;
  sourceId?: string;
  channels: NotificationChannel[];
}

export interface NotificationDto {
  id: string;
  recipientUserId: string;
  title: string;
  content: string;
  sourceModule?: string;
  sourceId?: string;
  readAt?: string;
  createdAt: string;
}
