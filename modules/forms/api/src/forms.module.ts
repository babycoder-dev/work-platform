import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { FormsDbModule, FORMS_DB_POOL } from './db/forms-db.module';
import { FORMS_REPOSITORY } from './db/forms-repository.token';
import { PostgresFormsRepository } from './db/postgres-forms.repository';
import { FormsHealthController } from './system/forms-health.controller';

@Module({
  imports: [FormsDbModule],
  controllers: [FormsHealthController],
  providers: [
    {
      provide: PostgresFormsRepository,
      useFactory: (pool: Pool) => new PostgresFormsRepository(pool),
      inject: [FORMS_DB_POOL],
    },
    {
      provide: FORMS_REPOSITORY,
      useExisting: PostgresFormsRepository,
    },
  ],
  exports: [FORMS_REPOSITORY],
})
export class FormsModule {}
