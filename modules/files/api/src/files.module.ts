import { Module } from '@nestjs/common';
import { EVENT_BUS, MemoryEventBus } from '@work/event-bus';
import { FILE_STORAGE_SERVICE } from '@work/files-contract';
import { PlatformModule } from '@work/platform-api';
import { Pool } from 'pg';
import { FILES_STORAGE_CONFIG, readFilesStorageConfig, type FilesStorageConfig } from './config/files-storage.config';
import { FilesDbModule, FILES_DB_POOL } from './db/files-db.module';
import { FILES_REPOSITORY } from './db/files-repository.token';
import { InMemoryFilesRepository } from './db/in-memory-files.repository';
import { PostgresFilesRepository } from './db/postgres-files.repository';
import { FilesController } from './files/files.controller';
import { FilesCleanupService } from './files/files-cleanup.service';
import { FilesService } from './files/files.service';
import { FilesUploadInterceptor } from './files/files-upload.interceptor';
import { FILES_CLOCK, SystemFilesClock } from './storage/clock';
import { DISK_SPACE_PROBE, NodeDiskSpaceProbe } from './storage/disk-space';
import { LocalFileStorageProvider } from './storage/local-file-storage.provider';
import { FilesHealthController } from './system/files-health.controller';

@Module({
  imports: [PlatformModule, FilesDbModule],
  controllers: [FilesHealthController, FilesController],
  providers: [
    {
      provide: FILES_STORAGE_CONFIG,
      useFactory: () => readFilesStorageConfig(),
    },
    {
      provide: PostgresFilesRepository,
      useFactory: (pool: Pool) => new PostgresFilesRepository(pool),
      inject: [FILES_DB_POOL],
    },
    InMemoryFilesRepository,
    {
      provide: FILES_REPOSITORY,
      useFactory: (
        config: FilesStorageConfig,
        postgresRepository: PostgresFilesRepository,
        memoryRepository: InMemoryFilesRepository,
      ) => (config.repositoryDriver === 'memory' ? memoryRepository : postgresRepository),
      inject: [FILES_STORAGE_CONFIG, PostgresFilesRepository, InMemoryFilesRepository],
    },
    {
      provide: FILES_CLOCK,
      useClass: SystemFilesClock,
    },
    {
      provide: DISK_SPACE_PROBE,
      useClass: NodeDiskSpaceProbe,
    },
    {
      provide: EVENT_BUS,
      useFactory: () => new MemoryEventBus(),
    },
    LocalFileStorageProvider,
    FilesService,
    FilesUploadInterceptor,
    FilesCleanupService,
    {
      provide: FILE_STORAGE_SERVICE,
      useExisting: FilesService,
    },
  ],
  exports: [FILES_REPOSITORY, FILE_STORAGE_SERVICE, FilesService],
})
export class FilesModule {}
