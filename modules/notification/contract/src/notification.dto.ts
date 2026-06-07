export const notificationChannels = ['in_app', 'im', 'email', 'sms'] as const;

export type NotificationChannel = (typeof notificationChannels)[number];

export interface CreateNotificationInput {
  recipientUserIds: string[];
  title: string;
  content: string;
  sourceModule?: string;
  sourceId?: string;
  channel?: NotificationChannel;
}

export interface NotificationDto {
  id: string;
  recipientUserId: string;
  title: string;
  content: string;
  sourceModule?: string;
  sourceId?: string;
  channel: NotificationChannel;
  readAt?: string;
  createdAt: string;
}

export interface ListNotificationsQuery {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListNotificationsResponse {
  items: NotificationDto[];
  total: number;
}

export interface UnreadNotificationCountResponse {
  count: number;
}

export interface MarkAllNotificationsReadResponse {
  count: number;
}
