import { randomUUID } from 'node:crypto';
import type { FileObjectDto, FileReferenceDto } from '@work/files-contract';
import type {
  CreateFileObjectRecordInput,
  CreateFileReferenceRecordInput,
  FilesRepository,
} from './files.repository';

export class InMemoryFilesRepository implements FilesRepository {
  readonly objects: FileObjectDto[] = [];
  readonly references: FileReferenceDto[] = [];

  async createFileObject(input: CreateFileObjectRecordInput): Promise<FileObjectDto> {
    const now = new Date().toISOString();
    const object: FileObjectDto = {
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
    this.objects.push(object);
    return object;
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
}
