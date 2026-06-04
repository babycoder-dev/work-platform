import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { EventBus } from '@work/event-bus';
import type { PlatformAuditPort } from '@work/platform-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FilesStorageConfig } from '../config/files-storage.config';
import { InMemoryFilesRepository } from '../db/in-memory-files.repository';
import type { FilesClock } from '../storage/clock';
import type { DiskSpaceProbe } from '../storage/disk-space';
import { LocalFileStorageProvider } from '../storage/local-file-storage.provider';
import { FilesService } from './files.service';

describe('FilesService', () => {
  let root: string;
  let repository: InMemoryFilesRepository;
  let provider: LocalFileStorageProvider;
  let audit: PlatformAuditPort;
  let service: FilesService;
  let now: Date;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'work-files-service-'));
    repository = new InMemoryFilesRepository();
    now = new Date('2026-06-04T00:00:00.000Z');
    provider = new LocalFileStorageProvider(config(root), diskSpace());
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    service = new FilesService(
      repository,
      provider,
      config(root),
      clock(() => now),
      audit,
      eventBus(),
    );
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('uploads staged metadata, audits success, and allows only owner metadata reads', async () => {
    const object = await service.uploadFile(actor('user-a'), textUpload('hello'), {});

    expect(object.status).toBe('staged');
    expect(object.stagedExpiresAt).toBe('2026-06-05T00:00:00.000Z');
    expect(object.sha256).toHaveLength(64);
    await expect(service.getOwnMetadata(actor('user-a'), object.id)).resolves.toEqual(object);
    await expect(service.getOwnMetadata(actor('user-b'), object.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'files.object.upload',
        result: 'success',
        metadata: expect.objectContaining({ fileId: object.id, sizeBytes: 5 }),
      }),
    );
  });

  it('atomically attaches staged files and treats identical attach as idempotent', async () => {
    const object = await service.uploadFile(actor('user-a'), textUpload('hello'), {});
    const input = {
      fileIds: [object.id],
      ownerModule: 'forms',
      referenceType: 'form_record',
      referenceId: 'record-1',
    };

    await expect(
      service.withUnitOfWork((uow) => service.attachFiles(actor('user-a'), input, uow)),
    ).resolves.toEqual([expect.objectContaining({ id: object.id, status: 'attached' })]);
    await expect(
      service.withUnitOfWork((uow) => service.attachFiles(actor('user-a'), input, uow)),
    ).resolves.toEqual([expect.objectContaining({ id: object.id })]);
    await expect(
      service.withUnitOfWork((uow) =>
        service.attachFiles(actor('user-a'), { ...input, referenceId: 'record-2' }, uow),
      ),
    ).rejects.toThrow('文件已绑定到其他业务记录');

    await expect(
      service.attachFiles(actor('user-a'), input, { kind: 'unit-of-work' }),
    ).rejects.toThrow('FILES_UNIT_OF_WORK_REQUIRED');
  });

  it('opens only attached files through the matching business reference', async () => {
    const object = await service.uploadFile(actor('user-a'), textUpload('hello'), {});
    const reference = {
      ownerModule: 'forms',
      referenceType: 'form_record',
      referenceId: 'record-1',
    };

    await expect(
      service.openFile(actor('user-a'), { fileId: object.id, ...reference }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await service.withUnitOfWork((uow) =>
      service.attachFiles(actor('user-a'), { fileIds: [object.id], ...reference }, uow),
    );

    await expect(
      service.openFile(actor('user-b'), { fileId: object.id, ...reference }),
    ).resolves.toEqual(
      expect.objectContaining({ metadata: expect.objectContaining({ id: object.id }) }),
    );
    await expect(
      service.openFile(actor('user-a'), {
        fileId: object.id,
        ...reference,
        referenceId: 'record-2',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.openFile(actor('user-a', 'ent-other'), { fileId: object.id, ...reference }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects other uploader staged files as not found', async () => {
    const object = await service.uploadFile(actor('user-a'), textUpload('hello'), {});

    await expect(
      service.withUnitOfWork((uow) =>
        service.attachFiles(
          actor('user-b'),
          {
            fileIds: [object.id],
            ownerModule: 'forms',
            referenceType: 'form_record',
            referenceId: 'record-1',
          },
          uow,
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces user quota and keeps quota charged while deleting', async () => {
    service = new FilesService(
      repository,
      provider,
      { ...config(root), userQuotaBytes: 8 },
      clock(() => now),
      audit,
      eventBus(),
    );

    await service.uploadFile(actor('user-a'), textUpload('hello'), {});
    await expect(service.uploadFile(actor('user-a'), textUpload('world'), {})).rejects.toThrow(
      '用户文件配额已满',
    );
  });

  it('rate limits upload count per minute', async () => {
    service = new FilesService(
      repository,
      provider,
      { ...config(root), uploadsPerMinute: 1 },
      clock(() => now),
      audit,
      eventBus(),
    );

    await service.uploadFile(actor('user-a'), textUpload('hello'), {});
    await expect(service.uploadFile(actor('user-a'), textUpload('world'), {})).rejects.toThrow(
      '上传过于频繁',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'files.object.upload',
        result: 'failure',
        metadata: expect.objectContaining({ reason: 'FILES_UPLOAD_RATE_LIMITED' }),
      }),
    );
  });

  it('does not count rejected upload bytes against the hourly success-byte limit', async () => {
    service = new FilesService(
      repository,
      provider,
      { ...config(root), uploadBytesPerHour: 6 },
      clock(() => now),
      audit,
      eventBus(),
    );

    await expect(
      service.uploadFile(
        actor('user-a'),
        {
          originalName: 'avatar.png',
          mediaType: 'image/png',
          sizeBytes: 5,
          content: Buffer.from('bad'),
        },
        {},
      ),
    ).rejects.toThrow('文件内容与声明类型不匹配');
    await expect(service.uploadFile(actor('user-a'), textUpload('hello'), {})).resolves.toEqual(
      expect.objectContaining({ sizeBytes: 5 }),
    );
    await expect(service.uploadFile(actor('user-a'), textUpload('ok'), {})).rejects.toThrow(
      '上传过于频繁',
    );
  });

  it('audits upload failure when disk thresholds reject the upload with 503', async () => {
    provider = new LocalFileStorageProvider(
      { ...config(root), minFreeBytes: 8, minFreeRatio: 0.5 },
      {
        async get() {
          return { freeBytes: 10, totalBytes: 20 };
        },
      },
    );
    service = new FilesService(
      repository,
      provider,
      { ...config(root), minFreeBytes: 8, minFreeRatio: 0.5 },
      clock(() => now),
      audit,
      eventBus(),
    );

    await expect(
      service.uploadFile(actor('user-a'), textUpload('hello'), {}),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'files.object.upload',
        result: 'failure',
        metadata: expect.objectContaining({
          mediaType: 'text/plain',
          sizeBytes: 5,
          reason: 'STORAGE_WRITE_FAILED',
        }),
      }),
    );
  });

  it('cleans expired staged files and retries deleting objects when disk delete failed', async () => {
    const object = await service.uploadFile(actor('user-a'), textUpload('hello'), {});
    const stored = await repository.findFileObjectById('ent-default', object.id);
    expect(stored).toBeDefined();
    now = new Date('2026-06-06T00:00:00.000Z');

    const originalDelete = provider.delete.bind(provider);
    const deleteSpy = vi
      .spyOn(provider, 'delete')
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockImplementation(originalDelete);

    await expect(service.cleanupExpiredStaged()).resolves.toEqual({
      cleaned: 0,
      releasedBytes: 0,
      failed: 1,
    });
    await expect(repository.findFileObjectById('ent-default', object.id)).resolves.toEqual(
      expect.objectContaining({ status: 'deleting' }),
    );
    await expect(service.cleanupExpiredStaged()).resolves.toEqual({
      cleaned: 1,
      releasedBytes: 5,
      failed: 0,
    });
    expect(deleteSpy).toHaveBeenCalledTimes(2);
  });
});

function actor(userId: string, enterpriseId = 'ent-default') {
  return { enterpriseId, userId, permissionCodes: [] };
}

function textUpload(text: string) {
  return {
    originalName: 'note.txt',
    mediaType: 'text/plain',
    sizeBytes: Buffer.byteLength(text),
    content: Buffer.from(text),
  };
}

function config(root: string): FilesStorageConfig {
  return {
    localRoot: root,
    maxBytes: 100,
    stagedTtlMs: 24 * 60 * 60 * 1000,
    tenantQuotaBytes: 100,
    userQuotaBytes: 100,
    uploadsPerMinute: 20,
    uploadBytesPerHour: 200,
    minFreeBytes: 1,
    minFreeRatio: 0,
    cleanupIntervalMs: 0,
    repositoryDriver: 'memory',
  };
}

function clock(now: () => Date): FilesClock {
  return { now };
}

function diskSpace(): DiskSpaceProbe {
  return {
    async get() {
      return { freeBytes: 1024 * 1024, totalBytes: 1024 * 1024 };
    },
  };
}

function eventBus(): EventBus {
  return {
    publish: vi.fn(async (event) => ({
      ...event,
      id: 'event-id',
      occurredAt: '2026-06-04T00:00:00.000Z',
    })),
    subscribe: vi.fn(() => () => undefined),
  };
}
