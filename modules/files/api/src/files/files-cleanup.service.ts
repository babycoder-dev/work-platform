import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { FILES_STORAGE_CONFIG, type FilesStorageConfig } from '../config/files-storage.config';
import { FilesService } from './files.service';

@Injectable()
export class FilesCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FilesCleanupService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(FilesService) private readonly filesService: FilesService,
    @Inject(FILES_STORAGE_CONFIG) private readonly config: FilesStorageConfig,
  ) {}

  onModuleInit(): void {
    if (this.config.cleanupIntervalMs <= 0) {
      return;
    }
    this.timer = setInterval(() => {
      this.filesService.cleanupExpiredStaged().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'unknown cleanup error';
        this.logger.warn(`files cleanup cycle failed: ${message}`);
      });
    }, this.config.cleanupIntervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}
