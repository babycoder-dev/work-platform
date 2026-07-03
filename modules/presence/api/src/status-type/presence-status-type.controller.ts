import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import {
  buildAuthAuditContext,
  dtoValidationPipe,
  RequirePermissions,
  type RequestWithAuth,
} from '@work/nest-common';
import type { CurrentUserDto } from '@work/platform-contract';
import { presencePermissions } from '@work/presence-contract';
import {
  CreatePresenceStatusTypeDto,
  UpdatePresenceStatusTypeDto,
} from './presence-status-type.dto';
import { PresenceStatusTypeService } from './presence-status-type.service';

@Controller('presence/status-types')
export class PresenceStatusTypeController {
  constructor(
    @Inject(PresenceStatusTypeService)
    private readonly statusTypeService: PresenceStatusTypeService,
  ) {}

  @Get()
  @RequirePermissions(presencePermissions.statusCreate)
  listActive(@Req() request: RequestWithAuth) {
    return this.statusTypeService.listActive(currentUser(request).enterpriseId);
  }

  @Get('all')
  @RequirePermissions(presencePermissions.statusTypeManage)
  listAll(@Req() request: RequestWithAuth) {
    return this.statusTypeService.listAll(currentUser(request).enterpriseId);
  }

  @Post()
  @RequirePermissions(presencePermissions.statusTypeManage)
  create(
    @Req() request: RequestWithAuth,
    @Body(dtoValidationPipe(CreatePresenceStatusTypeDto)) input: CreatePresenceStatusTypeDto,
  ) {
    return this.statusTypeService.create(
      currentUser(request),
      input,
      buildAuthAuditContext(request),
    );
  }

  @Patch(':id')
  @RequirePermissions(presencePermissions.statusTypeManage)
  update(
    @Req() request: RequestWithAuth,
    @Param('id') id: string,
    @Body(dtoValidationPipe(UpdatePresenceStatusTypeDto)) input: UpdatePresenceStatusTypeDto,
  ) {
    return this.statusTypeService.update(
      currentUser(request),
      id,
      input,
      buildAuthAuditContext(request),
    );
  }

  @Post(':id/default')
  @RequirePermissions(presencePermissions.statusTypeManage)
  setDefault(@Req() request: RequestWithAuth, @Param('id') id: string) {
    return this.statusTypeService.setDefault(
      currentUser(request),
      id,
      buildAuthAuditContext(request),
    );
  }

  @Post(':id/archive')
  @RequirePermissions(presencePermissions.statusTypeManage)
  archive(@Req() request: RequestWithAuth, @Param('id') id: string) {
    return this.statusTypeService.archive(currentUser(request), id, buildAuthAuditContext(request));
  }

  @Post(':id/restore')
  @RequirePermissions(presencePermissions.statusTypeManage)
  restore(@Req() request: RequestWithAuth, @Param('id') id: string) {
    return this.statusTypeService.restore(currentUser(request), id, buildAuthAuditContext(request));
  }
}

function currentUser(request: RequestWithAuth): CurrentUserDto {
  if (!request.currentUser) throw new Error('PlatformAuthGuard did not attach currentUser');
  return request.currentUser as CurrentUserDto;
}
