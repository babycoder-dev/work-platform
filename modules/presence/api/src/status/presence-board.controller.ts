import { Controller, Get, Query } from '@nestjs/common';
import type { PresenceBoardQuery } from '@work/presence-contract';
import { PresenceStatusService } from './presence-status.service';

@Controller('presence/board')
export class PresenceBoardController {
  constructor(private readonly presenceStatusService: PresenceStatusService) {}

  @Get()
  getBoard(@Query() query: PresenceBoardQuery) {
    return this.presenceStatusService.getBoard(query);
  }
}
