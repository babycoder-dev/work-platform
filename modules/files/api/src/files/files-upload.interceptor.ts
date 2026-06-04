import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { buildAuthAuditContext, type RequestWithAuth } from '@work/nest-common';
import type { FileActorContext } from '@work/files-contract';
import {
  catchError,
  from,
  mergeMap,
  throwError,
  type Observable,
  type ObservableInput,
} from 'rxjs';
import { FILES_STORAGE_CONFIG, type FilesStorageConfig } from '../config/files-storage.config';
import { FilesService } from './files.service';

@Injectable()
export class FilesUploadInterceptor implements NestInterceptor {
  private delegate: NestInterceptor | undefined;

  constructor(
    @Inject(FILES_STORAGE_CONFIG) private readonly config: FilesStorageConfig,
    @Inject(FilesService) private readonly filesService: FilesService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    try {
      const result = this.getDelegate().intercept(context, next);
      return from(Promise.resolve(result)).pipe(
        mergeMap((value) => value as ObservableInput<unknown>),
        catchError((error: unknown) => this.handleUploadInterceptorError(context, error)),
      );
    } catch (error) {
      return this.handleUploadInterceptorError(context, error);
    }
  }

  private getDelegate(): NestInterceptor {
    if (!this.delegate) {
      const Interceptor = FileInterceptor('file', {
        limits: {
          fileSize: this.config.maxBytes,
          files: 1,
          fields: 0,
        },
      }) as Type<NestInterceptor>;
      this.delegate = new Interceptor();
    }
    return this.delegate;
  }

  private handleUploadInterceptorError(
    context: ExecutionContext,
    error: unknown,
  ): Observable<never> {
    if (!isMulterUploadRejection(error)) {
      return throwError(() => error);
    }
    return from(this.recordMulterFailure(context, error)).pipe(
      mergeMap(() => throwError(() => normalizeMulterError(error))),
    );
  }

  private async recordMulterFailure(context: ExecutionContext, error: unknown): Promise<void> {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const currentUser = request.currentUser;
    if (!currentUser) {
      return;
    }
    const actor: FileActorContext = {
      enterpriseId: currentUser.enterpriseId,
      userId: currentUser.id,
      permissionCodes: currentUser.permissions.map((permission) => permission.code),
    };
    await this.filesService.recordUploadFailure(actor, buildAuthAuditContext(request), {
      reason: reasonFromMulterError(error),
      multerCode: getMulterCode(error),
    });
  }
}

function isMulterUploadRejection(error: unknown): boolean {
  const code = getMulterCode(error);
  if (code) {
    return (
      code === 'LIMIT_FILE_SIZE' ||
      code === 'LIMIT_FIELD_COUNT' ||
      code === 'LIMIT_UNEXPECTED_FILE' ||
      code === 'LIMIT_PART_COUNT'
    );
  }
  const message = getHttpExceptionMessage(error);
  return (
    message === 'File too large' ||
    message === 'Too many fields' ||
    message === 'Unexpected field' ||
    message === 'Too many parts' ||
    message === 'Field name too long' ||
    message === 'Field value too long' ||
    message === 'Missing field name' ||
    message === 'Multipart: Boundary not found' ||
    message.startsWith('Multipart: ')
  );
}

function normalizeMulterError(error: unknown): Error {
  const code = getMulterCode(error);
  if (code === 'LIMIT_FILE_SIZE' || getHttpExceptionMessage(error) === 'File too large') {
    return new PayloadTooLargeException('文件大小超过限制');
  }
  return new BadRequestException('不允许额外 multipart 字段');
}

function reasonFromMulterError(error: unknown): string {
  const code = getMulterCode(error);
  if (code === 'LIMIT_FILE_SIZE' || getHttpExceptionMessage(error) === 'File too large') {
    return 'FILES_UPLOAD_TOO_LARGE';
  }
  return 'FILES_UPLOAD_UNEXPECTED_FIELD';
}

function getMulterCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code?: unknown }).code);
  }
  const message = getHttpExceptionMessage(error);
  if (message === 'File too large') {
    return 'LIMIT_FILE_SIZE';
  }
  if (message === 'Too many fields') {
    return 'LIMIT_FIELD_COUNT';
  }
  if (message === 'Unexpected field') {
    return 'LIMIT_UNEXPECTED_FILE';
  }
  if (message === 'Too many parts') {
    return 'LIMIT_PART_COUNT';
  }
  return undefined;
}

function getHttpExceptionMessage(error: unknown): string {
  if (!(error instanceof HttpException)) {
    return '';
  }
  const response = error.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = (response as { message?: unknown }).message;
    if (Array.isArray(message)) {
      return message.join(', ');
    }
    if (typeof message === 'string') {
      return message;
    }
  }
  return error.message;
}
