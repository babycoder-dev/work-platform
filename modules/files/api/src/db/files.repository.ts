import type { FileObjectDto, FileObjectStatus, FileReferenceDto, UnitOfWork } from '@work/files-contract';

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
  createStagedFileObjectWithQuota(input: CreateFileObjectRecordInput, quota: FilesQuotaLimits): Promise<FileObjectDto>;
  findFileObjectById(enterpriseId: string, id: string): Promise<FileObjectDto | undefined>;
  findOwnFileObjectById(
    enterpriseId: string,
    uploadedBy: string,
    id: string,
  ): Promise<FileObjectDto | undefined>;
  findAttachedFileObjectByReference(input: FindAttachedFileObjectByReferenceInput): Promise<FileObjectDto | undefined>;
  createFileReference(input: CreateFileReferenceRecordInput): Promise<FileReferenceDto>;
  listFileReferences(enterpriseId: string, fileId: string): Promise<FileReferenceDto[]>;
  withUnitOfWork<T>(operation: (uow: UnitOfWork) => Promise<T>): Promise<T>;
  attachStagedFile(input: AttachStagedFileInput, uow: UnitOfWork): Promise<AttachStagedFileResult>;
  claimExpiredStagedFiles(input: ClaimExpiredStagedFilesInput): Promise<FileObjectDto[]>;
  markFileDeleted(enterpriseId: string, fileId: string, deletedAt: string): Promise<FileObjectDto | undefined>;
  sumStoredBytes(enterpriseId: string, uploadedBy?: string): Promise<number>;
}

export interface FilesQuotaLimits {
  tenantQuotaBytes: number;
  userQuotaBytes: number;
}

export interface AttachStagedFileInput {
  enterpriseId: string;
  fileId: string;
  uploadedBy: string;
  ownerModule: string;
  referenceType: string;
  referenceId: string;
  attachedBy: string;
}

export interface FindAttachedFileObjectByReferenceInput {
  enterpriseId: string;
  fileId: string;
  ownerModule: string;
  referenceType: string;
  referenceId: string;
}

export type AttachStagedFileResult =
  | { kind: 'attached'; object: FileObjectDto; reference: FileReferenceDto }
  | { kind: 'idempotent'; object: FileObjectDto; reference: FileReferenceDto }
  | { kind: 'not_found' }
  | { kind: 'already_referenced' };

export interface ClaimExpiredStagedFilesInput {
  now: string;
  limit: number;
}
