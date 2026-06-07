import type { CreateNotificationInput, NotificationDto } from './notification.dto';

export const NOTIFICATION_SERVICE = Symbol.for('NOTIFICATION_SERVICE');

export interface NotificationServicePort {
  create(input: CreateNotificationInput): Promise<{ items: NotificationDto[] }>;
}
