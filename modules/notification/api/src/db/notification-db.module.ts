import { Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { readNotificationDatabaseConfig } from './db.config';

export const NOTIFICATION_DB_POOL = Symbol.for('NOTIFICATION_DB_POOL');

export const notificationDbPoolProvider = {
  provide: NOTIFICATION_DB_POOL,
  useFactory: () => {
    const config = readNotificationDatabaseConfig();

    return new Pool({
      connectionString: config.databaseUrl,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      max: config.poolMax,
    });
  },
};

@Injectable()
export class NotificationDbPoolLifecycle implements OnModuleDestroy {
  constructor(@Inject(NOTIFICATION_DB_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [notificationDbPoolProvider, NotificationDbPoolLifecycle],
  exports: [NOTIFICATION_DB_POOL],
})
export class NotificationDbModule {}
