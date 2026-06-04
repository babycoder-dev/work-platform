import type {
  AttachFilesInput,
  FileActorContext,
  FileObjectDto,
  OpenFileInput,
  ReadableFileObject,
  UnitOfWork,
} from './files.dto';

export const FILE_STORAGE_SERVICE = Symbol('FILE_STORAGE_SERVICE');

export interface FileStoragePort {
  withUnitOfWork<T>(operation: (uow: UnitOfWork) => Promise<T>): Promise<T>;
  attachFiles(
    actor: FileActorContext,
    input: AttachFilesInput,
    uow: UnitOfWork,
  ): Promise<FileObjectDto[]>;
  openFile(actor: FileActorContext, input: OpenFileInput): Promise<ReadableFileObject>;
}
