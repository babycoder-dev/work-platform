import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
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
import { NOTIFICATION_SCHEDULE_CONFIG_REPOSITORY } from './db/schedule-config-repository.token';
import { InMemoryScheduleConfigRepository } from './db/in-memory-schedule-config.repository';
import { PostgresScheduleConfigRepository } from './db/postgres-schedule-config.repository';
import { TriggerConfigService } from './trigger-config/trigger-config.service';
import { RecipientResolver } from './recipient/recipient-resolver';
import { NotificationEventSubscriber } from './events/notification-event.subscriber';
import { HeartbeatJob } from './scheduler/jobs/heartbeat.job';
import {
  ReportReminderCompletedJob,
  ReportReminderDueJob,
} from './scheduler/jobs/report-reminder.jobs';
import { SchedulerBootstrapService } from './scheduler/scheduler-bootstrap.service';

@Module({
  // ScheduleModule.forRoot() 由 notification 模块装配一次：notification 经 gateway 装配一次，
  // 故 forRoot() 全进程仅执行一次，SchedulerRegistry 全局可用（RFC §9.1 选型；§2.1 决策）。
  imports: [EventBusModule, PlatformModule, NotificationDbModule, ScheduleModule.forRoot()],
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
    {
      provide: PostgresScheduleConfigRepository,
      useFactory: (pool: Pool) => new PostgresScheduleConfigRepository(pool),
      inject: [NOTIFICATION_DB_POOL],
    },
    InMemoryNotificationRepository,
    InMemoryTriggerConfigRepository,
    InMemoryScheduleConfigRepository,
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
    {
      provide: NOTIFICATION_SCHEDULE_CONFIG_REPOSITORY,
      useFactory: (
        postgresRepository: PostgresScheduleConfigRepository,
        memoryRepository: InMemoryScheduleConfigRepository,
      ) =>
        process.env.NOTIFICATION_REPOSITORY_DRIVER === 'memory' ||
        process.env.PLATFORM_REPOSITORY_DRIVER === 'memory'
          ? memoryRepository
          : postgresRepository,
      inject: [PostgresScheduleConfigRepository, InMemoryScheduleConfigRepository],
    },
    NotificationService,
    RecipientResolver,
    NotificationEventSubscriber,
    TriggerConfigService,
    HeartbeatJob,
    ReportReminderDueJob,
    ReportReminderCompletedJob,
    SchedulerBootstrapService,
    {
      provide: NOTIFICATION_SERVICE,
      useExisting: NotificationService,
    },
  ],
  exports: [
    NOTIFICATION_REPOSITORY,
    NOTIFICATION_TRIGGER_CONFIG_REPOSITORY,
    NOTIFICATION_SCHEDULE_CONFIG_REPOSITORY,
    NOTIFICATION_SERVICE,
    NotificationService,
  ],
})
export class NotificationModule {}
