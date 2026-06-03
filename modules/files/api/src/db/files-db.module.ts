import { Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { readFilesDatabaseConfig } from './db.config';

export const FILES_DB_POOL = Symbol.for('FILES_DB_POOL');

export const filesDbPoolProvider = {
  provide: FILES_DB_POOL,
  useFactory: () => {
    const config = readFilesDatabaseConfig();

    return new Pool({
      connectionString: config.databaseUrl,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    });
  },
};

@Injectable()
export class FilesDbPoolLifecycle implements OnModuleDestroy {
  constructor(@Inject(FILES_DB_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [filesDbPoolProvider, FilesDbPoolLifecycle],
  exports: [FILES_DB_POOL],
})
export class FilesDbModule {}
