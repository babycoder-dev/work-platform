import { Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { readFormsDatabaseConfig } from './db.config';

export const FORMS_DB_POOL = Symbol.for('FORMS_DB_POOL');

export const formsDbPoolProvider = {
  provide: FORMS_DB_POOL,
  useFactory: () => {
    const config = readFormsDatabaseConfig();

    return new Pool({
      connectionString: config.databaseUrl,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    });
  },
};

@Injectable()
export class FormsDbPoolLifecycle implements OnModuleDestroy {
  constructor(@Inject(FORMS_DB_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [formsDbPoolProvider, FormsDbPoolLifecycle],
  exports: [FORMS_DB_POOL],
})
export class FormsDbModule {}
