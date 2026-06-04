import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { buildAuthAuditContext, RequirePermissions, type RequestWithAuth } from '@work/nest-common';
import { filesPermissions, type FileActorContext } from '@work/files-contract';
import { FilesService } from './files.service';
import { FilesUploadInterceptor } from './files-upload.interceptor';

interface MulterMemoryFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('files')
export class FilesController {
  constructor(@Inject(FilesService) private readonly filesService: FilesService) {}

  @Post()
  @RequirePermissions(filesPermissions.objectUpload)
  @UseInterceptors(FilesUploadInterceptor)
  async uploadFile(
    @Req() request: RequestWithAuth,
    @UploadedFile() file?: MulterMemoryFile,
    @Body() body?: Record<string, unknown>,
  ) {
    const actor = toActor(request);
    const auditContext = buildAuthAuditContext(request);
    if (!file) {
      await this.filesService.recordUploadFailure(actor, auditContext, {
        reason: 'FILES_UPLOAD_MISSING_FILE',
      });
      throw new BadRequestException('缺少文件');
    }
    if (Object.keys(body ?? {}).length > 0) {
      await this.filesService.recordUploadFailure(actor, auditContext, {
        originalName: file.originalname,
        mediaType: file.mimetype,
        sizeBytes: file.size,
        reason: 'FILES_UPLOAD_UNEXPECTED_FIELD',
      });
      throw new BadRequestException('不允许额外 multipart 字段');
    }
    return this.filesService.uploadFile(
      actor,
      {
        originalName: file.originalname,
        mediaType: file.mimetype,
        sizeBytes: file.size,
        content: file.buffer,
      },
      auditContext,
    );
  }

  @Get(':id')
  @RequirePermissions(filesPermissions.objectViewOwn)
  getMetadata(@Req() request: RequestWithAuth, @Param('id') id: string) {
    if (!isUuid(id)) {
      throw new NotFoundException('文件不存在');
    }
    return this.filesService.getOwnMetadata(toActor(request), id);
  }
}

function toActor(request: RequestWithAuth): FileActorContext {
  const currentUser = request.currentUser;
  if (!currentUser) {
    throw new BadRequestException('缺少认证用户');
  }
  return {
    enterpriseId: currentUser.enterpriseId,
    userId: currentUser.id,
    permissionCodes: currentUser.permissions.map((permission) => permission.code),
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
