import { Module } from '@nestjs/common';
import { EventBusModule } from '@work/nest-common';
import { PlatformModule } from '@work/platform-api';
import { Pool } from 'pg';
import { PresenceDbModule, PRESENCE_DB_POOL } from './db/presence-db.module';
import { InMemoryPresenceRepository } from './db/in-memory-presence.repository';
import { PostgresPresenceRepository } from './db/postgres-presence.repository';
import { PRESENCE_REPOSITORY } from './db/presence-repository.token';
import { PresenceBoardController } from './status/presence-board.controller';
import { PresenceStatusController } from './status/presence-status.controller';
import { PresenceStatusService } from './status/presence-status.service';

@Module({
  imports: [EventBusModule, PlatformModule, PresenceDbModule],
  controllers: [PresenceBoardController, PresenceStatusController],
  providers: [
    {
      provide: PostgresPresenceRepository,
      useFactory: (pool: Pool) => new PostgresPresenceRepository(pool),
      inject: [PRESENCE_DB_POOL],
    },
    InMemoryPresenceRepository,
    {
      provide: PRESENCE_REPOSITORY,
      useFactory: (
        postgresRepository: PostgresPresenceRepository,
        memoryRepository: InMemoryPresenceRepository,
      ) => (process.env.PLATFORM_REPOSITORY_DRIVER === 'memory' ? memoryRepository : postgresRepository),
      inject: [PostgresPresenceRepository, InMemoryPresenceRepository],
    },
    PresenceStatusService,
  ],
  exports: [PresenceStatusService],
})
export class PresenceModule {}
