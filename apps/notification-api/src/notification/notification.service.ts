import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CreateNotificationInput, NotificationDto } from '@work/notification-center';

@Injectable()
export class NotificationService {
  private readonly notifications = new Map<string, NotificationDto>();

  listNotifications(recipientUserId?: string) {
    const items = Array.from(this.notifications.values()).filter(
      (notification) => !recipientUserId || notification.recipientUserId === recipientUserId,
    );

    return {
      items,
    };
  }

  createNotification(input: CreateNotificationInput) {
    const createdAt = new Date().toISOString();
    const items = input.recipientUserIds.map((recipientUserId) => {
      const notification: NotificationDto = {
        id: randomUUID(),
        recipientUserId,
        title: input.title,
        content: input.content,
        sourceModule: input.sourceModule,
        sourceId: input.sourceId,
        createdAt,
      };

      this.notifications.set(notification.id, notification);
      return notification;
    });

    return {
      items,
      channels: input.channels,
    };
  }

  markAsRead(id: string) {
    const notification = this.notifications.get(id);
    if (!notification) {
      throw new NotFoundException('通知不存在');
    }

    const updated: NotificationDto = {
      ...notification,
      readAt: new Date().toISOString(),
    };

    this.notifications.set(id, updated);
    return updated;
  }
}
