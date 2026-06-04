import {
  Body,
  Controller,
  INestApplication,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type RequestWithAuth } from '@work/nest-common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FILES_STORAGE_CONFIG } from '../config/files-storage.config';
import { FilesService } from './files.service';
import { FilesUploadInterceptor } from './files-upload.interceptor';

@Controller('files-test')
class TestFilesUploadController {
  @Post()
  @UseInterceptors(FilesUploadInterceptor)
  upload(
    @Req() _request: RequestWithAuth,
    @UploadedFile() file?: { originalname: string },
    @Body() body?: Record<string, unknown>,
  ) {
    return { fileName: file?.originalname, fieldCount: Object.keys(body ?? {}).length };
  }
}

describe('FilesUploadInterceptor', () => {
  let app: INestApplication;
  const recordUploadFailure = vi.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestFilesUploadController],
      providers: [
        FilesUploadInterceptor,
        {
          provide: FILES_STORAGE_CONFIG,
          useValue: {
            maxBytes: 4,
          },
        },
        {
          provide: FilesService,
          useValue: {
            recordUploadFailure,
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use((req: RequestWithAuth, _res: unknown, next: () => void) => {
      req.currentUser = {
        id: 'user-1',
        enterpriseId: 'ent-default',
        employeeNo: 'T-001',
        account: 'tester',
        name: 'Tester',
        permissions: [{ code: 'files:object:upload' }],
      };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('audits extra multipart fields rejected by multer before controller execution', async () => {
    recordUploadFailure.mockClear();

    await request(app.getHttpServer())
      .post('/files-test')
      .field('enterpriseId', 'ent-other')
      .attach('file', Buffer.from('ok'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      })
      .expect(400);

    expect(recordUploadFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        enterpriseId: 'ent-default',
        userId: 'user-1',
      }),
      expect.any(Object),
      expect.objectContaining({
        reason: 'FILES_UPLOAD_UNEXPECTED_FIELD',
        multerCode: 'LIMIT_FIELD_COUNT',
      }),
    );
  });

  it('audits oversized files rejected by multer before controller execution', async () => {
    recordUploadFailure.mockClear();

    await request(app.getHttpServer())
      .post('/files-test')
      .attach('file', Buffer.from('hello'), {
        filename: 'too-large.txt',
        contentType: 'text/plain',
      })
      .expect(413);

    expect(recordUploadFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        enterpriseId: 'ent-default',
        userId: 'user-1',
      }),
      expect.any(Object),
      expect.objectContaining({
        reason: 'FILES_UPLOAD_TOO_LARGE',
        multerCode: 'LIMIT_FILE_SIZE',
      }),
    );
  });
});
