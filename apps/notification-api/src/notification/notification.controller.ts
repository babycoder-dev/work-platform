import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import type { CreateNotificationInput } from '@work/notification-center';
import { NotificationService } from './notification.service';

@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  listNotifications(@Query('recipientUserId') recipientUserId?: string) {
    return this.notificationService.listNotifications(recipientUserId);
  }

  @Post()
  createNotification(@Body() input: CreateNotificationInput) {
    return this.notificationService.createNotification(input);
  }

  @Put(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.notificationService.markAsRead(id);
  }
}
