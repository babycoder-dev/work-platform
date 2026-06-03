export type FileObjectStatus = 'staged' | 'attached' | 'deleting' | 'deleted';

export interface FileObjectDto {
  id: string;
  enterpriseId: string;
  provider: string;
  storageKey: string;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  status: FileObjectStatus;
  uploadedBy: string;
  createdAt: string;
  stagedExpiresAt: string;
  deletedAt?: string;
}

export interface FileReferenceDto {
  id: string;
  enterpriseId: string;
  fileId: string;
  ownerModule: string;
  referenceType: string;
  referenceId: string;
  attachedBy: string;
  createdAt: string;
}

export interface FileActorContext {
  enterpriseId: string;
  userId: string;
  permissionCodes: string[];
}

export interface AttachFilesInput {
  fileIds: string[];
  ownerModule: string;
  referenceType: string;
  referenceId: string;
}

export interface ReadableFileObject {
  metadata: FileObjectDto;
  content: AsyncIterable<Uint8Array>;
}

export interface UnitOfWork {
  readonly kind: 'unit-of-work';
}
