import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '@work/event-bus';
import { ApiError } from '@work/errors';
import type {
  AttachFilesInput,
  FileActorContext,
  FileObjectDto,
  FileStoragePort,
  OpenFileInput,
  ReadableFileObject,
  UnitOfWork,
  UploadFileInput,
} from '@work/files-contract';
import { filesEvents, type FilesObjectUploadedEvent } from '@work/files-contract';
import { PLATFORM_AUDIT_SERVICE, type PlatformAuditPort } from '@work/platform-contract';
import { FILES_STORAGE_CONFIG, type FilesStorageConfig } from '../config/files-storage.config';
import { FILES_REPOSITORY } from '../db/files-repository.token';
import type { FilesRepository } from '../db/files.repository';
import { FILES_CLOCK, type FilesClock } from '../storage/clock';
import { FilesRateLimiter } from '../storage/files-rate-limiter';
import { LocalFileStorageProvider } from '../storage/local-file-storage.provider';

export interface FilesAuditContext {
  traceId?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class FilesService implements FileStoragePort {
  private readonly logger = new Logger(FilesService.name);
  private readonly rateLimiter: FilesRateLimiter;

  constructor(
    @Inject(FILES_REPOSITORY) private readonly repository: FilesRepository,
    @Inject(LocalFileStorageProvider) private readonly provider: LocalFileStorageProvider,
    @Inject(FILES_STORAGE_CONFIG) private readonly config: FilesStorageConfig,
    @Inject(FILES_CLOCK) private readonly clock: FilesClock,
    @Inject(PLATFORM_AUDIT_SERVICE) private readonly auditService: PlatformAuditPort,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
  ) {
    this.rateLimiter = new FilesRateLimiter(
      clock,
      config.uploadsPerMinute,
      config.uploadBytesPerHour,
    );
  }

  async uploadFile(
    actor: FileActorContext,
    input: UploadFileInput,
    auditContext: FilesAuditContext,
  ): Promise<FileObjectDto> {
    let stored: Awaited<ReturnType<LocalFileStorageProvider['store']>> | undefined;
    let object: FileObjectDto;
    try {
      this.rateLimiter.assertAttemptAllowed(actor.enterpriseId, actor.userId);
      this.rateLimiter.assertSuccessfulBytesAllowed(
        actor.enterpriseId,
        actor.userId,
        input.sizeBytes,
      );
      stored = await this.provider.store({
        enterpriseId: actor.enterpriseId,
        originalName: input.originalName,
        mediaType: input.mediaType,
        content: input.content,
      });
      const createdAt = this.clock.now();
      object = await this.repository.createStagedFileObjectWithQuota(
        {
          enterpriseId: actor.enterpriseId,
          provider: stored.provider,
          storageKey: stored.storageKey,
          originalName: stored.originalName,
          mediaType: stored.mediaType,
          sizeBytes: stored.sizeBytes,
          sha256: stored.sha256,
          status: 'staged',
          uploadedBy: actor.userId,
          stagedExpiresAt: new Date(createdAt.getTime() + this.config.stagedTtlMs).toISOString(),
        },
        {
          tenantQuotaBytes: this.config.tenantQuotaBytes,
          userQuotaBytes: this.config.userQuotaBytes,
        },
      );
    } catch (error) {
      if (stored) {
        await this.provider.delete(stored.storageKey).catch(() => undefined);
      }
      await this.recordUploadFailure(actor, auditContext, {
        mediaType: input.mediaType,
        sizeBytes: input.sizeBytes,
        reason: normalizeFailureReason(error),
      });
      throw normalizeUploadError(error);
    }

    this.rateLimiter.recordSuccessfulBytes(actor.enterpriseId, actor.userId, object.sizeBytes);
    await this.recordUploadSuccess(actor, auditContext, object);
    return object;
  }

  async recordUploadFailure(
    actor: FileActorContext,
    auditContext: FilesAuditContext,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.auditUpload(actor, auditContext, 'failure', metadata);
  }

  async getOwnMetadata(actor: FileActorContext, fileId: string): Promise<FileObjectDto> {
    const object = await this.repository.findOwnFileObjectById(
      actor.enterpriseId,
      actor.userId,
      fileId,
    );
    if (!object) {
      throw new NotFoundException('文件不存在');
    }
    return object;
  }

  async withUnitOfWork<T>(operation: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    return this.repository.withUnitOfWork(operation);
  }

  async attachFiles(
    actor: FileActorContext,
    input: AttachFilesInput,
    uow: UnitOfWork,
  ): Promise<FileObjectDto[]> {
    const attached: FileObjectDto[] = [];
    for (const fileId of input.fileIds) {
      const result = await this.repository.attachStagedFile(
        {
          enterpriseId: actor.enterpriseId,
          fileId,
          uploadedBy: actor.userId,
          ownerModule: input.ownerModule,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          attachedBy: actor.userId,
        },
        uow,
      );
      if (result.kind === 'not_found') {
        throw new NotFoundException('文件不存在');
      }
      if (result.kind === 'already_referenced') {
        throw new BadRequestException('文件已绑定到其他业务记录');
      }
      attached.push(result.object);
    }
    return attached;
  }

  async openFile(actor: FileActorContext, input: OpenFileInput): Promise<ReadableFileObject> {
    const metadata = await this.repository.findAttachedFileObjectByReference({
      enterpriseId: actor.enterpriseId,
      fileId: input.fileId,
      ownerModule: input.ownerModule,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    });
    if (!metadata) {
      throw new NotFoundException('文件不存在');
    }
    return {
      metadata,
      content: this.provider.open(metadata.storageKey),
    };
  }

  async cleanupExpiredStaged(
    limit = 100,
  ): Promise<{ cleaned: number; releasedBytes: number; failed: number }> {
    const claimed = await this.repository.claimExpiredStagedFiles({
      now: this.clock.now().toISOString(),
      limit,
    });
    let cleaned = 0;
    let failed = 0;
    let releasedBytes = 0;

    for (const object of claimed) {
      try {
        await this.provider.delete(object.storageKey);
        const deleted = await this.repository.markFileDeleted(
          object.enterpriseId,
          object.id,
          this.clock.now().toISOString(),
        );
        if (deleted) {
          cleaned += 1;
          releasedBytes += object.sizeBytes;
        }
      } catch {
        failed += 1;
        this.logger.warn(`files cleanup failed for object ${object.id}`);
        await this.auditService.record({
          actorUserId: undefined,
          actorAccount: 'system',
          action: 'files.object.cleanup',
          resourceType: 'files.file_object',
          resourceId: object.id,
          result: 'failure',
          metadata: {
            status: 'deleting',
            sizeBytes: object.sizeBytes,
          },
        });
      }
    }

    if (cleaned > 0 || failed > 0) {
      await this.auditService.record({
        actorUserId: undefined,
        actorAccount: 'system',
        action: 'files.object.cleanup',
        resourceType: 'files.file_object',
        result: failed > 0 ? 'failure' : 'success',
        metadata: {
          cleaned,
          failed,
          releasedBytes,
        },
      });
    }

    return { cleaned, releasedBytes, failed };
  }

  private async auditUpload(
    actor: FileActorContext,
    auditContext: FilesAuditContext,
    result: 'success' | 'failure',
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.record({
      actorUserId: actor.userId,
      action: 'files.object.upload',
      resourceType: 'files.file_object',
      resourceId: typeof metadata.fileId === 'string' ? metadata.fileId : undefined,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result,
      metadata,
    });
  }

  private async recordUploadSuccess(
    actor: FileActorContext,
    auditContext: FilesAuditContext,
    object: FileObjectDto,
  ): Promise<void> {
    await this.auditUpload(actor, auditContext, 'success', {
      fileId: object.id,
      mediaType: object.mediaType,
      sizeBytes: object.sizeBytes,
    });
    await this.eventBus.publish<FilesObjectUploadedEvent>({
      type: filesEvents.objectUploaded,
      source: 'files.api',
      traceId: auditContext.traceId,
      payload: {
        enterpriseId: actor.enterpriseId,
        fileId: object.id,
        uploadedBy: actor.userId,
        mediaType: object.mediaType,
        sizeBytes: object.sizeBytes,
        occurredAt: this.clock.now().toISOString(),
      },
    });
  }
}

function normalizeUploadError(error: unknown): unknown {
  if (error instanceof Error && error.message === 'FILES_TENANT_QUOTA_EXCEEDED') {
    return new ApiError('FILES_TENANT_QUOTA_EXCEEDED', '租户文件配额已满', { status: 413 });
  }
  if (error instanceof Error && error.message === 'FILES_USER_QUOTA_EXCEEDED') {
    return new ApiError('FILES_USER_QUOTA_EXCEEDED', '用户文件配额已满', { status: 413 });
  }
  return error;
}

function normalizeFailureReason(error: unknown): string {
  if (error instanceof ApiError) {
    return error.code;
  }
  if (error instanceof Error) {
    if (error.message === 'FILES_TENANT_QUOTA_EXCEEDED') {
      return 'FILES_TENANT_QUOTA_EXCEEDED';
    }
    if (error.message === 'FILES_USER_QUOTA_EXCEEDED') {
      return 'FILES_USER_QUOTA_EXCEEDED';
    }
  }
  return 'STORAGE_WRITE_FAILED';
}
