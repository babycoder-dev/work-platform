import { Module } from '@nestjs/common';
import { PresenceBoardController } from './status/presence-board.controller';
import { PresenceStatusController } from './status/presence-status.controller';
import { PresenceStatusService } from './status/presence-status.service';

@Module({
  controllers: [PresenceBoardController, PresenceStatusController],
  providers: [PresenceStatusService],
  exports: [PresenceStatusService],
})
export class PresenceModule {}
