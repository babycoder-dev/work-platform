import { Module } from '@nestjs/common';
import { NOTIFICATION_SERVICE } from '@work/notification-contract';
import { PlatformModule } from '@work/platform-api';
import { Pool } from 'pg';
import { NotificationDbModule, NOTIFICATION_DB_POOL } from './db/notification-db.module';
import { NOTIFICATION_REPOSITORY } from './db/notification-repository.token';
import { InMemoryNotificationRepository } from './db/in-memory-notification.repository';
import { PostgresNotificationRepository } from './db/postgres-notification.repository';
import { NotificationController } from './notification/notification.controller';
import { NotificationService } from './notification/notification.service';
import { NotificationHealthController } from './system/notification-health.controller';

@Module({
  imports: [PlatformModule, NotificationDbModule],
  controllers: [NotificationHealthController, NotificationController],
  providers: [
    {
      provide: PostgresNotificationRepository,
      useFactory: (pool: Pool) => new PostgresNotificationRepository(pool),
      inject: [NOTIFICATION_DB_POOL],
    },
    InMemoryNotificationRepository,
    {
      provide: NOTIFICATION_REPOSITORY,
      useFactory: (
        postgresRepository: PostgresNotificationRepository,
        memoryRepository: InMemoryNotificationRepository,
      ) =>
        process.env.NOTIFICATION_REPOSITORY_DRIVER === 'memory' ||
        process.env.PLATFORM_REPOSITORY_DRIVER === 'memory'
          ? memoryRepository
          : postgresRepository,
      inject: [PostgresNotificationRepository, InMemoryNotificationRepository],
    },
    NotificationService,
    {
      provide: NOTIFICATION_SERVICE,
      useExisting: NotificationService,
    },
  ],
  exports: [NOTIFICATION_REPOSITORY, NOTIFICATION_SERVICE, NotificationService],
})
export class NotificationModule {}
