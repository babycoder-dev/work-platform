import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { RequestWithAuth } from '@work/nest-common';
import { NotificationService } from './notification.service';

@Controller('notification')
export class NotificationController {
  constructor(
    @Inject(NotificationService) private readonly notificationService: NotificationService,
  ) {}

  @Get()
  list(
    @Req() request: RequestWithAuth,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.notificationService.list(currentUserId(request), {
      unreadOnly: parseBoolean(unreadOnly),
      limit: parseNumber(limit),
      offset: parseNumber(offset),
    });
  }

  @Get('unread-count')
  unreadCount(@Req() request: RequestWithAuth) {
    return this.notificationService.unreadCount(currentUserId(request));
  }

  @Put(':id/read')
  markRead(@Req() request: RequestWithAuth, @Param('id') id: string) {
    return this.notificationService.markRead(currentUserId(request), id);
  }

  @Put('read-all')
  markAllRead(@Req() request: RequestWithAuth) {
    return this.notificationService.markAllRead(currentUserId(request));
  }
}

function currentUserId(request: RequestWithAuth): string {
  const userId = request.currentUser?.id;
  if (!userId) {
    throw new BadRequestException('缺少认证用户');
  }
  return userId;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  return value === 'true' || value === '1';
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  return Number(value);
}
