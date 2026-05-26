import { Controller, Get, Req } from '@nestjs/common';
import { RequirePermissions, type RequestWithAuth } from '@work/nest-common';
import type { CurrentUserDto } from '@work/platform-contract';
import { presencePermissions } from '@work/presence-contract';
import { PresenceStatusService } from './presence-status.service';

@Controller('presence/board')
export class PresenceBoardController {
  constructor(private readonly presenceStatusService: PresenceStatusService) {}

  @Get()
  @RequirePermissions(presencePermissions.boardView)
  getBoard(@Req() request: RequestWithAuth) {
    return this.presenceStatusService.getBoard(request.currentUser as CurrentUserDto);
  }
}
