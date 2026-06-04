import { BadRequestException } from '@nestjs/common';
import type { RequestWithAuth } from '@work/nest-common';
import { describe, expect, it, vi } from 'vitest';
import type { FilesService } from './files.service';
import { FilesController } from './files.controller';

describe('FilesController', () => {
  it('audits missing-file upload failures before returning 400', async () => {
    const service = mockFilesService();
    const controller = new FilesController(service);

    await expect(controller.uploadFile(request(), undefined, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(service.recordUploadFailure).toHaveBeenCalledWith(
      expect.objectContaining({ enterpriseId: 'ent-default', userId: 'user-a' }),
      expect.objectContaining({ traceId: 'trace-1', ip: '127.0.0.1' }),
      { reason: 'FILES_UPLOAD_MISSING_FILE' },
    );
  });

  it('audits unexpected multipart fields before returning 400', async () => {
    const service = mockFilesService();
    const controller = new FilesController(service);

    await expect(
      controller.uploadFile(
        request(),
        {
          originalname: 'note.txt',
          mimetype: 'text/plain',
          size: 2,
          buffer: Buffer.from('ok'),
        },
        { enterpriseId: 'ent-other' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(service.recordUploadFailure).toHaveBeenCalledWith(
      expect.objectContaining({ enterpriseId: 'ent-default', userId: 'user-a' }),
      expect.objectContaining({ traceId: 'trace-1', ip: '127.0.0.1' }),
      expect.objectContaining({
        originalName: 'note.txt',
        mediaType: 'text/plain',
        sizeBytes: 2,
        reason: 'FILES_UPLOAD_UNEXPECTED_FIELD',
      }),
    );
  });
});

function mockFilesService(): FilesService {
  return {
    recordUploadFailure: vi.fn().mockResolvedValue(undefined),
    uploadFile: vi.fn(),
  } as unknown as FilesService;
}

function request(): RequestWithAuth {
  return {
    traceId: 'trace-1',
    ip: '127.0.0.1',
    headers: { 'user-agent': 'vitest' },
    currentUser: {
      id: 'user-a',
      account: 'user-a',
      employeeNo: 'U001',
      name: 'User A',
      enterpriseId: 'ent-default',
      permissions: [{ code: 'files:object:upload' }],
    },
  };
}
