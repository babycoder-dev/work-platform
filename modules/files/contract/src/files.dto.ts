export type FileObjectStatus = 'staged' | 'attached' | 'deleting' | 'deleted';

export const FILE_STORAGE_DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
export const FILE_STORAGE_MAX_ORIGINAL_NAME_LENGTH = 255;
export const FILE_STORAGE_DEFAULT_STAGED_TTL_HOURS = 24;
export const FILE_STORAGE_DEFAULT_TENANT_QUOTA_BYTES = 10 * 1024 * 1024 * 1024;
export const FILE_STORAGE_DEFAULT_USER_QUOTA_BYTES = 1024 * 1024 * 1024;
export const FILE_STORAGE_DEFAULT_UPLOADS_PER_MINUTE = 20;
export const FILE_STORAGE_DEFAULT_UPLOAD_BYTES_PER_HOUR = 200 * 1024 * 1024;
export const FILE_STORAGE_DEFAULT_MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024;
export const FILE_STORAGE_DEFAULT_MIN_FREE_RATIO = 0.1;
export const FILE_STORAGE_DEFAULT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

export const FILE_STORAGE_ALLOWED_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
] as const;

export type FileStorageAllowedMediaType = (typeof FILE_STORAGE_ALLOWED_MEDIA_TYPES)[number];

export const FILE_STORAGE_ALLOWED_EXTENSIONS: Record<FileStorageAllowedMediaType, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
};

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

export interface OpenFileInput {
  fileId: string;
  ownerModule: string;
  referenceType: string;
  referenceId: string;
}

export interface UploadFileInput {
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  content: Uint8Array;
}

export interface ReadableFileObject {
  metadata: FileObjectDto;
  content: AsyncIterable<Uint8Array>;
}

export interface UnitOfWork {
  readonly kind: 'unit-of-work';
}
