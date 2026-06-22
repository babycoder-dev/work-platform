import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { dtoValidationPipe, PermissionGuard, RequirePermissions } from '@work/nest-common';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import type { PlatformRequest } from '../auth/request-user';
import { buildPlatformAuditContext } from '../auth/request-user';
import { CreateStatusLogsDto } from './status-log.dto';
import { StatusLogService } from './status-log.service';

@Controller('status-logs')
@UseGuards(PlatformAuthGuard, PermissionGuard)
export class StatusLogController {
  constructor(@Inject(StatusLogService) private readonly statusLogService: StatusLogService) {}

  @Post()
  @RequirePermissions('platform:status-log:create')
  createStatusLogs(
    @Body(dtoValidationPipe(CreateStatusLogsDto)) input: CreateStatusLogsDto,
    @Req() request: PlatformRequest,
  ) {
    return this.statusLogService.createStatusLogs(
      input,
      request.currentUser!,
      buildPlatformAuditContext(request),
    );
  }
}
