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

    await expect(repository.findFileObjectById('ent-a', fileObject.id)).resolves.toEqual(fileObject);
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
});
