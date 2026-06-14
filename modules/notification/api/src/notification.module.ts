import { Module } from '@nestjs/common';
import { EventBusModule } from '@work/nest-common';
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
import { NOTIFICATION_TRIGGER_CONFIG_REPOSITORY } from './db/trigger-config-repository.token';
import { InMemoryTriggerConfigRepository } from './db/in-memory-trigger-config.repository';
import { PostgresTriggerConfigRepository } from './db/postgres-trigger-config.repository';
import { TriggerConfigService } from './trigger-config/trigger-config.service';
import { RecipientResolver } from './recipient/recipient-resolver';
import { NotificationEventSubscriber } from './events/notification-event.subscriber';

@Module({
  imports: [EventBusModule, PlatformModule, NotificationDbModule],
  controllers: [NotificationHealthController, NotificationController],
  providers: [
    {
      provide: PostgresNotificationRepository,
      useFactory: (pool: Pool) => new PostgresNotificationRepository(pool),
      inject: [NOTIFICATION_DB_POOL],
    },
    {
      provide: PostgresTriggerConfigRepository,
      useFactory: (pool: Pool) => new PostgresTriggerConfigRepository(pool),
      inject: [NOTIFICATION_DB_POOL],
    },
    InMemoryNotificationRepository,
    InMemoryTriggerConfigRepository,
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
    {
      provide: NOTIFICATION_TRIGGER_CONFIG_REPOSITORY,
      useFactory: (
        postgresRepository: PostgresTriggerConfigRepository,
        memoryRepository: InMemoryTriggerConfigRepository,
      ) =>
        process.env.NOTIFICATION_REPOSITORY_DRIVER === 'memory' ||
        process.env.PLATFORM_REPOSITORY_DRIVER === 'memory'
          ? memoryRepository
          : postgresRepository,
      inject: [PostgresTriggerConfigRepository, InMemoryTriggerConfigRepository],
    },
    NotificationService,
    RecipientResolver,
    NotificationEventSubscriber,
    TriggerConfigService,
    {
      provide: NOTIFICATION_SERVICE,
      useExisting: NotificationService,
    },
  ],
  exports: [
    NOTIFICATION_REPOSITORY,
    NOTIFICATION_TRIGGER_CONFIG_REPOSITORY,
    NOTIFICATION_SERVICE,
    NotificationService,
  ],
})
export class NotificationModule {}
