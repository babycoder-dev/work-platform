import type { FileObjectDto, FileObjectStatus, FileReferenceDto } from '@work/files-contract';

export interface CreateFileObjectRecordInput {
  id?: string;
  enterpriseId: string;
  provider: string;
  storageKey: string;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  status?: FileObjectStatus;
  uploadedBy: string;
  stagedExpiresAt: string;
  deletedAt?: string;
}

export interface CreateFileReferenceRecordInput {
  id?: string;
  enterpriseId: string;
  fileId: string;
  ownerModule: string;
  referenceType: string;
  referenceId: string;
  attachedBy: string;
}

export interface FilesRepository {
  createFileObject(input: CreateFileObjectRecordInput): Promise<FileObjectDto>;
  findFileObjectById(enterpriseId: string, id: string): Promise<FileObjectDto | undefined>;
  createFileReference(input: CreateFileReferenceRecordInput): Promise<FileReferenceDto>;
  listFileReferences(enterpriseId: string, fileId: string): Promise<FileReferenceDto[]>;
}
