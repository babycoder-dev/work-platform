import { Module } from '@nestjs/common';
import { EVENT_BUS, MemoryEventBus } from '@work/event-bus';
import { PlatformModule } from '@work/platform-api';
import { Pool } from 'pg';
import { PresenceDbModule, PRESENCE_DB_POOL } from './db/presence-db.module';
import { PostgresPresenceRepository } from './db/postgres-presence.repository';
import { PRESENCE_REPOSITORY } from './db/presence-repository.token';
import { PresenceBoardController } from './status/presence-board.controller';
import { PresenceStatusController } from './status/presence-status.controller';
import { PresenceStatusService } from './status/presence-status.service';

@Module({
  imports: [PlatformModule, PresenceDbModule],
  controllers: [PresenceBoardController, PresenceStatusController],
  providers: [
    {
      provide: PostgresPresenceRepository,
      useFactory: (pool: Pool) => new PostgresPresenceRepository(pool),
      inject: [PRESENCE_DB_POOL],
    },
    {
      provide: PRESENCE_REPOSITORY,
      useExisting: PostgresPresenceRepository,
    },
    {
      provide: EVENT_BUS,
      useFactory: () => new MemoryEventBus(),
    },
    PresenceStatusService,
  ],
  exports: [PresenceStatusService],
})
export class PresenceModule {}
