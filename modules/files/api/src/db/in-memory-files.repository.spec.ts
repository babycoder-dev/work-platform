import { describe, expect, it } from 'vitest';
import { InMemoryFilesRepository } from './in-memory-files.repository';

describe('InMemoryFilesRepository', () => {
  it('keeps file objects and references isolated by enterpriseId', async () => {
    const repository = new InMemoryFilesRepository();
    const fileObject = await repository.createFileObject({
      id: 'file-1',
      enterpriseId: 'ent-a',
      provider: 'temp-disk',
      storageKey: 'ent-a/2026/06/file-1',
      originalName: 'avatar.png',
      mediaType: 'image/png',
      sizeBytes: 128,
      sha256: 'a'.repeat(64),
      uploadedBy: 'user-a',
      stagedExpiresAt: '2026-06-04T00:00:00.000Z',
    });
    await repository.createFileReference({
      enterpriseId: 'ent-a',
      fileId: fileObject.id,
      ownerModule: 'forms',
      referenceType: 'form_record',
      referenceId: 'record-a',
      attachedBy: 'user-a',
    });

    await expect(repository.findFileObjectById('ent-a', fileObject.id)).resolves.toEqual(
      fileObject,
    );
    await expect(repository.findFileObjectById('ent-b', fileObject.id)).resolves.toBeUndefined();
    await expect(repository.listFileReferences('ent-a', fileObject.id)).resolves.toHaveLength(1);
    await expect(repository.listFileReferences('ent-b', fileObject.id)).resolves.toEqual([]);
  });

  it('rejects references when the file object belongs to another enterprise', async () => {
    const repository = new InMemoryFilesRepository();
    const fileObject = await repository.createFileObject({
      id: 'file-1',
      enterpriseId: 'ent-a',
      provider: 'temp-disk',
      storageKey: 'ent-a/2026/06/file-1',
      originalName: 'avatar.png',
      mediaType: 'image/png',
      sizeBytes: 128,
      sha256: 'a'.repeat(64),
      uploadedBy: 'user-a',
      stagedExpiresAt: '2026-06-04T00:00:00.000Z',
    });

    await expect(
      repository.createFileReference({
        enterpriseId: 'ent-b',
        fileId: fileObject.id,
        ownerModule: 'forms',
        referenceType: 'form_record',
        referenceId: 'record-a',
        attachedBy: 'user-b',
      }),
    ).rejects.toThrow('FILE_OBJECT_NOT_FOUND');
  });

  it('enforces quota, attach idempotency, and cleanup state transitions', async () => {
    const repository = new InMemoryFilesRepository();
    const fileObject = await repository.createStagedFileObjectWithQuota(
      {
        id: 'file-quota',
        enterpriseId: 'ent-a',
        provider: 'temp-disk',
        storageKey: 'ent-a/2026/06/file-quota',
        originalName: 'quota.txt',
        mediaType: 'text/plain',
        sizeBytes: 5,
        sha256: 'c'.repeat(64),
        uploadedBy: 'user-a',
        stagedExpiresAt: '2026-06-05T00:00:00.000Z',
      },
      { tenantQuotaBytes: 8, userQuotaBytes: 8 },
    );

    await expect(
      repository.createStagedFileObjectWithQuota(
        {
          enterpriseId: 'ent-a',
          provider: 'temp-disk',
          storageKey: 'ent-a/2026/06/file-quota-2',
          originalName: 'quota-2.txt',
          mediaType: 'text/plain',
          sizeBytes: 5,
          sha256: 'd'.repeat(64),
          uploadedBy: 'user-a',
          stagedExpiresAt: '2026-06-05T00:00:00.000Z',
        },
        { tenantQuotaBytes: 8, userQuotaBytes: 8 },
      ),
    ).rejects.toThrow('FILES_TENANT_QUOTA_EXCEEDED');

    const attached = await repository.withUnitOfWork((uow) =>
      repository.attachStagedFile(
        {
          enterpriseId: 'ent-a',
          fileId: fileObject.id,
          uploadedBy: 'user-a',
          ownerModule: 'forms',
          referenceType: 'form_record',
          referenceId: 'record-1',
          attachedBy: 'user-a',
        },
        uow,
      ),
    );
    expect(attached.kind).toBe('attached');
    await expect(
      repository.withUnitOfWork((uow) =>
        repository.attachStagedFile(
          {
            enterpriseId: 'ent-a',
            fileId: fileObject.id,
            uploadedBy: 'user-a',
            ownerModule: 'forms',
            referenceType: 'form_record',
            referenceId: 'record-1',
            attachedBy: 'user-a',
          },
          uow,
        ),
      ),
    ).resolves.toEqual(expect.objectContaining({ kind: 'idempotent' }));

    const expired = await repository.createFileObject({
      id: 'file-expired',
      enterpriseId: 'ent-a',
      provider: 'temp-disk',
      storageKey: 'ent-a/2026/06/file-expired',
      originalName: 'expired.txt',
      mediaType: 'text/plain',
      sizeBytes: 7,
      sha256: 'e'.repeat(64),
      uploadedBy: 'user-a',
      stagedExpiresAt: '2026-06-01T00:00:00.000Z',
    });
    await expect(
      repository.claimExpiredStagedFiles({ now: '2026-06-04T00:00:00.000Z', limit: 10 }),
    ).resolves.toEqual([expect.objectContaining({ id: expired.id, status: 'deleting' })]);
    await expect(
      repository.markFileDeleted('ent-a', expired.id, '2026-06-04T00:00:00.000Z'),
    ).resolves.toEqual(expect.objectContaining({ id: expired.id, status: 'deleted' }));
  });

  it('rolls back attached state and references when the unit of work fails', async () => {
    const repository = new InMemoryFilesRepository();
    const fileObject = await repository.createFileObject({
      id: 'file-rollback',
      enterpriseId: 'ent-a',
      provider: 'temp-disk',
      storageKey: 'ent-a/2026/06/file-rollback',
      originalName: 'rollback.txt',
      mediaType: 'text/plain',
      sizeBytes: 5,
      sha256: 'f'.repeat(64),
      uploadedBy: 'user-a',
      stagedExpiresAt: '2026-06-05T00:00:00.000Z',
    });

    await expect(
      repository.withUnitOfWork(async (uow) => {
        await repository.attachStagedFile(
          {
            enterpriseId: 'ent-a',
            fileId: fileObject.id,
            uploadedBy: 'user-a',
            ownerModule: 'forms',
            referenceType: 'form_record',
            referenceId: 'record-rollback',
            attachedBy: 'user-a',
          },
          uow,
        );
        throw new Error('forms record failed');
      }),
    ).rejects.toThrow('forms record failed');

    await expect(repository.findFileObjectById('ent-a', fileObject.id)).resolves.toEqual(
      expect.objectContaining({ status: 'staged' }),
    );
    await expect(repository.listFileReferences('ent-a', fileObject.id)).resolves.toEqual([]);
  });
});
