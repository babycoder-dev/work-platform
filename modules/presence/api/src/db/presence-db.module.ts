import { Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { readPresenceDatabaseConfig } from './db.config';

export const PRESENCE_DB_POOL = Symbol.for('PRESENCE_DB_POOL');

export const presenceDbPoolProvider = {
  provide: PRESENCE_DB_POOL,
  useFactory: () => {
    const config = readPresenceDatabaseConfig();

    return new Pool({
      connectionString: config.databaseUrl,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    });
  },
};

@Injectable()
export class PresenceDbPoolLifecycle implements OnModuleDestroy {
  constructor(@Inject(PRESENCE_DB_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [presenceDbPoolProvider, PresenceDbPoolLifecycle],
  exports: [PRESENCE_DB_POOL],
})
export class PresenceDbModule {}
