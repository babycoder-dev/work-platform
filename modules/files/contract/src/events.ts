export const filesEvents = {
  objectUploaded: 'files.object.uploaded',
} as const;

export interface FilesObjectUploadedEvent {
  enterpriseId: string;
  fileId: string;
  mediaType: string;
  sizeBytes: number;
  uploadedBy: string;
  occurredAt: string;
}
