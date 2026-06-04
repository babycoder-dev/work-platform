import type {
  AttachFilesInput,
  FileActorContext,
  FileObjectDto,
  ReadableFileObject,
  UnitOfWork,
} from './files.dto';

export const FILE_STORAGE_SERVICE = Symbol('FILE_STORAGE_SERVICE');

export interface FileStoragePort {
  attachFiles(
    actor: FileActorContext,
    input: AttachFilesInput,
    uow: UnitOfWork,
  ): Promise<FileObjectDto[]>;
  openFile(actor: FileActorContext, fileId: string): Promise<ReadableFileObject>;
}
