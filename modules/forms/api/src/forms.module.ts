import { Module } from '@nestjs/common';
import { FORMS_SERVICE } from '@work/forms-contract';
import { FilesModule } from '@work/files-api';
import { EventBusModule } from '@work/nest-common';
import { PlatformModule } from '@work/platform-api';
import { Pool } from 'pg';
import { FormsDbModule, FORMS_DB_POOL } from './db/forms-db.module';
import { FORMS_REPOSITORY } from './db/forms-repository.token';
import { InMemoryFormsRepository } from './db/in-memory-forms.repository';
import { PostgresFormsRepository } from './db/postgres-forms.repository';
import { FormsDefinitionController } from './forms/forms.controller';
import { FormsDefinitionPermissionGuard } from './forms/forms-definition-permission.guard';
import { FormsRecordController } from './forms/forms-record.controller';
import { FormsService } from './forms/forms.service';
import { FormsHealthController } from './system/forms-health.controller';

@Module({
  imports: [EventBusModule, PlatformModule, FilesModule, FormsDbModule],
  controllers: [FormsHealthController, FormsDefinitionController, FormsRecordController],
  providers: [
    {
      provide: PostgresFormsRepository,
      useFactory: (pool: Pool) => new PostgresFormsRepository(pool),
      inject: [FORMS_DB_POOL],
    },
    InMemoryFormsRepository,
    {
      provide: FORMS_REPOSITORY,
      useFactory: (
        postgresRepository: PostgresFormsRepository,
        memoryRepository: InMemoryFormsRepository,
      ) => (process.env.FORMS_REPOSITORY_DRIVER === 'memory' ? memoryRepository : postgresRepository),
      inject: [PostgresFormsRepository, InMemoryFormsRepository],
    },
    FormsService,
    FormsDefinitionPermissionGuard,
    {
      provide: FORMS_SERVICE,
      useExisting: FormsService,
    },
  ],
  exports: [FORMS_REPOSITORY, FORMS_SERVICE, FormsService],
})
export class FormsModule {}
