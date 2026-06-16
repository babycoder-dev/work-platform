import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Query,
  Req,
  Body,
  Sse,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import {
  buildAuthAuditContext,
  dtoValidationPipe,
  RequirePermissions,
  type RequestWithAuth,
} from '@work/nest-common';
import { notificationPermissions } from '@work/notification-contract';
import { NotificationService } from './notification.service';
import { TriggerConfigService } from '../trigger-config/trigger-config.service';
import { UpdateTriggerConfigDto } from '../trigger-config/trigger-config.dto';
import { NotificationStreamRegistry } from '../stream/notification-stream.registry';
import type { Observable } from 'rxjs';

@Controller('notification')
export class NotificationController {
  constructor(
    @Inject(NotificationService) private readonly notificationService: NotificationService,
    @Inject(TriggerConfigService) private readonly triggerConfigService: TriggerConfigService,
    @Inject(NotificationStreamRegistry)
    private readonly streamRegistry: NotificationStreamRegistry,
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

  @Sse('stream')
  stream(@Req() request: RequestWithAuth): Observable<MessageEvent> {
    return this.streamRegistry.connect(currentUserId(request));
  }

  @Get('trigger-config')
  @RequirePermissions(notificationPermissions.triggerConfigManage)
  listTriggerConfigs() {
    return this.triggerConfigService.list();
  }

  @Put('trigger-config/:key')
  @RequirePermissions(notificationPermissions.triggerConfigManage)
  updateTriggerConfig(
    @Req() request: RequestWithAuth,
    @Param('key') key: string,
    @Body(dtoValidationPipe(UpdateTriggerConfigDto)) input: UpdateTriggerConfigDto,
  ) {
    return this.triggerConfigService.upsert(
      key,
      input,
      currentUser(request),
      buildAuthAuditContext(request),
    );
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
  return currentUser(request).id;
}

function currentUser(request: RequestWithAuth) {
  const userId = request.currentUser?.id;
  if (!userId || !request.currentUser) {
    throw new BadRequestException('缺少认证用户');
  }
  return request.currentUser;
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
