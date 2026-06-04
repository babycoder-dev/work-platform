import { randomUUID } from 'node:crypto';
import type { FileObjectDto, FileReferenceDto, UnitOfWork } from '@work/files-contract';
import type {
  AttachStagedFileInput,
  AttachStagedFileResult,
  ClaimExpiredStagedFilesInput,
  CreateFileObjectRecordInput,
  CreateFileReferenceRecordInput,
  FindAttachedFileObjectByReferenceInput,
  FilesRepository,
  FilesQuotaLimits,
} from './files.repository';

export class InMemoryFilesRepository implements FilesRepository {
  readonly objects: FileObjectDto[] = [];
  readonly references: FileReferenceDto[] = [];
  private quotaLock: Promise<void> = Promise.resolve();
  private readonly activeUnitOfWorks = new WeakSet<UnitOfWork>();

  async createFileObject(input: CreateFileObjectRecordInput): Promise<FileObjectDto> {
    const object = this.buildObject(input);
    this.objects.push(object);
    return object;
  }

  async createStagedFileObjectWithQuota(
    input: CreateFileObjectRecordInput,
    quota: FilesQuotaLimits,
  ): Promise<FileObjectDto> {
    return this.withLock(async () => {
      const tenantBytes = await this.sumStoredBytes(input.enterpriseId);
      const userBytes = await this.sumStoredBytes(input.enterpriseId, input.uploadedBy);
      if (tenantBytes + input.sizeBytes > quota.tenantQuotaBytes) {
        throw new Error('FILES_TENANT_QUOTA_EXCEEDED');
      }
      if (userBytes + input.sizeBytes > quota.userQuotaBytes) {
        throw new Error('FILES_USER_QUOTA_EXCEEDED');
      }
      return this.createFileObject(input);
    });
  }

  async findOwnFileObjectById(
    enterpriseId: string,
    uploadedBy: string,
    id: string,
  ): Promise<FileObjectDto | undefined> {
    const object = await this.findFileObjectById(enterpriseId, id);
    if (!object || object.uploadedBy !== uploadedBy || object.status === 'deleted') {
      return undefined;
    }
    return object;
  }

  async findAttachedFileObjectByReference(
    input: FindAttachedFileObjectByReferenceInput,
  ): Promise<FileObjectDto | undefined> {
    const reference = this.references.find(
      (candidate) =>
        candidate.enterpriseId === input.enterpriseId &&
        candidate.fileId === input.fileId &&
        candidate.ownerModule === input.ownerModule &&
        candidate.referenceType === input.referenceType &&
        candidate.referenceId === input.referenceId,
    );
    if (!reference) {
      return undefined;
    }
    const object = await this.findFileObjectById(input.enterpriseId, input.fileId);
    if (!object || object.status !== 'attached') {
      return undefined;
    }
    return object;
  }

  async withUnitOfWork<T>(operation: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    return this.withLock(async () => {
      const uow: UnitOfWork = { kind: 'unit-of-work' };
      const objectSnapshot = this.objects.map((object) => ({ ...object }));
      const referenceSnapshot = this.references.map((reference) => ({ ...reference }));
      this.activeUnitOfWorks.add(uow);
      try {
        return await operation(uow);
      } catch (error) {
        this.objects.splice(0, this.objects.length, ...objectSnapshot);
        this.references.splice(0, this.references.length, ...referenceSnapshot);
        throw error;
      } finally {
        this.activeUnitOfWorks.delete(uow);
      }
    });
  }

  async attachStagedFile(input: AttachStagedFileInput, uow: UnitOfWork): Promise<AttachStagedFileResult> {
    if (!this.activeUnitOfWorks.has(uow)) {
      throw new Error('FILES_UNIT_OF_WORK_REQUIRED');
    }
      const objectIndex = this.objects.findIndex(
        (object) =>
          object.enterpriseId === input.enterpriseId &&
          object.id === input.fileId &&
          object.uploadedBy === input.uploadedBy,
      );
      if (objectIndex === -1) {
        return { kind: 'not_found' };
      }

      const object = this.objects[objectIndex];
      const existingReference = this.references.find(
        (reference) => reference.enterpriseId === input.enterpriseId && reference.fileId === input.fileId,
      );
      if (existingReference) {
        if (
          existingReference.ownerModule === input.ownerModule &&
          existingReference.referenceType === input.referenceType &&
          existingReference.referenceId === input.referenceId
        ) {
          return { kind: 'idempotent', object, reference: existingReference };
        }
        return { kind: 'already_referenced' };
      }

      if (object.status !== 'staged') {
        return { kind: 'not_found' };
      }

      const attachedObject: FileObjectDto = { ...object, status: 'attached' };
      this.objects[objectIndex] = attachedObject;
      const reference = await this.createFileReference({
        enterpriseId: input.enterpriseId,
        fileId: input.fileId,
        ownerModule: input.ownerModule,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        attachedBy: input.attachedBy,
      });
      return { kind: 'attached', object: attachedObject, reference };
  }

  async claimExpiredStagedFiles(input: ClaimExpiredStagedFilesInput): Promise<FileObjectDto[]> {
    return this.withLock(async () => {
      const claimed: FileObjectDto[] = [];
      for (const object of this.objects) {
        if (claimed.length >= input.limit) {
          break;
        }
        const hasReference = this.references.some(
          (reference) => reference.enterpriseId === object.enterpriseId && reference.fileId === object.id,
        );
        if (
          (object.status === 'staged' && object.stagedExpiresAt <= input.now && !hasReference) ||
          object.status === 'deleting'
        ) {
          object.status = 'deleting';
          claimed.push({ ...object });
        }
      }
      return claimed;
    });
  }

  async markFileDeleted(
    enterpriseId: string,
    fileId: string,
    deletedAt: string,
  ): Promise<FileObjectDto | undefined> {
    const object = this.objects.find(
      (candidate) => candidate.enterpriseId === enterpriseId && candidate.id === fileId,
    );
    if (!object || object.status !== 'deleting') {
      return undefined;
    }
    object.status = 'deleted';
    object.deletedAt = deletedAt;
    return { ...object };
  }

  async sumStoredBytes(enterpriseId: string, uploadedBy?: string): Promise<number> {
    return this.objects
      .filter(
        (object) =>
          object.enterpriseId === enterpriseId &&
          (uploadedBy === undefined || object.uploadedBy === uploadedBy) &&
          ['staged', 'attached', 'deleting'].includes(object.status),
      )
      .reduce((total, object) => total + object.sizeBytes, 0);
  }

  private buildObject(input: CreateFileObjectRecordInput): FileObjectDto {
    const now = new Date().toISOString();
    return {
      id: input.id ?? randomUUID(),
      enterpriseId: input.enterpriseId,
      provider: input.provider,
      storageKey: input.storageKey,
      originalName: input.originalName,
      mediaType: input.mediaType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      status: input.status ?? 'staged',
      uploadedBy: input.uploadedBy,
      createdAt: now,
      stagedExpiresAt: input.stagedExpiresAt,
      deletedAt: input.deletedAt,
    };
  }

  async findFileObjectById(enterpriseId: string, id: string): Promise<FileObjectDto | undefined> {
    return this.objects.find((object) => object.enterpriseId === enterpriseId && object.id === id);
  }

  async createFileReference(input: CreateFileReferenceRecordInput): Promise<FileReferenceDto> {
    if ((await this.findFileObjectById(input.enterpriseId, input.fileId)) === undefined) {
      throw new Error('FILE_OBJECT_NOT_FOUND');
    }

    const reference: FileReferenceDto = {
      id: input.id ?? randomUUID(),
      enterpriseId: input.enterpriseId,
      fileId: input.fileId,
      ownerModule: input.ownerModule,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      attachedBy: input.attachedBy,
      createdAt: new Date().toISOString(),
    };
    this.references.push(reference);
    return reference;
  }

  async listFileReferences(enterpriseId: string, fileId: string): Promise<FileReferenceDto[]> {
    return this.references.filter(
      (reference) => reference.enterpriseId === enterpriseId && reference.fileId === fileId,
    );
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    let release: () => void = () => undefined;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.quotaLock;
    this.quotaLock = previous.then(() => next);
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
