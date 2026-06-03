import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { FilesDbModule, FILES_DB_POOL } from './db/files-db.module';
import { FILES_REPOSITORY } from './db/files-repository.token';
import { PostgresFilesRepository } from './db/postgres-files.repository';
import { FilesHealthController } from './system/files-health.controller';

@Module({
  imports: [FilesDbModule],
  controllers: [FilesHealthController],
  providers: [
    {
      provide: PostgresFilesRepository,
      useFactory: (pool: Pool) => new PostgresFilesRepository(pool),
      inject: [FILES_DB_POOL],
    },
    {
      provide: FILES_REPOSITORY,
      useExisting: PostgresFilesRepository,
    },
  ],
  exports: [FILES_REPOSITORY],
})
export class FilesModule {}
