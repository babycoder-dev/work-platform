import { Body, Controller, Get, Post } from '@nestjs/common';
import type { CreatePresenceStatusRecordInput } from '@work/presence-contract';
import { PresenceStatusService } from './presence-status.service';

@Controller('presence/status-records')
export class PresenceStatusController {
  constructor(private readonly presenceStatusService: PresenceStatusService) {}

  @Get()
  listRecords() {
    return this.presenceStatusService.listRecords();
  }

  @Post()
  createRecord(@Body() input: CreatePresenceStatusRecordInput) {
    return this.presenceStatusService.createRecord(input);
  }
}
