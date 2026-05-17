import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { readPlatformDatabaseConfig } from './db.config';

export const PLATFORM_DB_POOL = Symbol('PLATFORM_DB_POOL');

export const platformDbPoolProvider = {
  provide: PLATFORM_DB_POOL,
  useFactory: () => {
    const config = readPlatformDatabaseConfig();

    return new Pool({
      connectionString: config.databaseUrl,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    });
  },
};

@Injectable()
export class PlatformDbPoolLifecycle implements OnModuleDestroy {
  constructor(@Inject(PLATFORM_DB_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
