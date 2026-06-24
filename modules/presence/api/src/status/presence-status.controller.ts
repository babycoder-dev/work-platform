import { Body, Controller, Delete, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { buildAuthAuditContext, RequirePermissions, type RequestWithAuth } from '@work/nest-common';
import type { CurrentUserDto } from '@work/platform-contract';
import type { CreatePresenceStatusRecordInput } from '@work/presence-contract';
import { presencePermissions } from '@work/presence-contract';
import { PresenceStatusService } from './presence-status.service';

@Controller('presence/status-records')
export class PresenceStatusController {
  constructor(@Inject(PresenceStatusService) private readonly presenceStatusService: PresenceStatusService) {}

  @Get('mine')
  @RequirePermissions(presencePermissions.statusCreate)
  listOwnRecords(@Req() request: RequestWithAuth) {
    return this.presenceStatusService.listOwnRecords(request.currentUser as CurrentUserDto);
  }

  @Get('by-employee/:employeeId')
  @RequirePermissions(presencePermissions.boardView)
  getEmployeeStatus(@Req() request: RequestWithAuth, @Param('employeeId') employeeId: string) {
    return this.presenceStatusService.getEmployeeStatus(
      request.currentUser as CurrentUserDto,
      employeeId,
    );
  }

  @Post()
  @RequirePermissions(presencePermissions.statusCreate)
  createRecord(@Req() request: RequestWithAuth, @Body() input: CreatePresenceStatusRecordInput) {
    return this.presenceStatusService.createRecord(
      request.currentUser as CurrentUserDto,
      input,
      buildAuthAuditContext(request),
    );
  }

  @Delete(':id')
  @RequirePermissions(presencePermissions.statusCreate)
  cancelRecord(@Req() request: RequestWithAuth, @Param('id') id: string) {
    return this.presenceStatusService.cancelRecord(
      request.currentUser as CurrentUserDto,
      id,
      buildAuthAuditContext(request),
    );
  }
}
