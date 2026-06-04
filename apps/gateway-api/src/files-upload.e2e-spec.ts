import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GatewayModule } from './gateway.module';

describe('files upload API', () => {
  let app: INestApplication;
  let root: string;
  let adminToken: string;
  let limitedToken: string;
  let filesUserToken: string;
  const previousEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'work-files-e2e-'));
    for (const key of [
      'PLATFORM_REPOSITORY_DRIVER',
      'FILES_REPOSITORY_DRIVER',
      'FILE_STORAGE_LOCAL_ROOT',
      'FILE_STORAGE_MAX_BYTES',
      'FILE_STORAGE_CLEANUP_INTERVAL_MS',
      'FILE_STORAGE_MIN_FREE_BYTES',
      'FILE_STORAGE_MIN_FREE_RATIO',
    ]) {
      previousEnv[key] = process.env[key];
    }
    process.env.PLATFORM_REPOSITORY_DRIVER = 'memory';
    process.env.FILES_REPOSITORY_DRIVER = 'memory';
    process.env.FILE_STORAGE_LOCAL_ROOT = root;
    process.env.FILE_STORAGE_MAX_BYTES = '4';
    process.env.FILE_STORAGE_CLEANUP_INTERVAL_MS = '0';
    process.env.FILE_STORAGE_MIN_FREE_BYTES = '1';
    process.env.FILE_STORAGE_MIN_FREE_RATIO = '0';

    const moduleRef = await Test.createTestingModule({
      imports: [GatewayModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configurePlatformHttp(app, { globalPrefix: 'api' });
    await app.init();
    adminToken = await login('admin', 'admin123');
    limitedToken = await createAndLoginLimitedUser();
    filesUserToken = await createAndLoginFilesUser();
  });

  afterAll(async () => {
    await app?.close();
    await fs.rm(root, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('enforces auth and permissions', async () => {
    await request(app.getHttpServer()).post('/api/files').expect(401);

    await request(app.getHttpServer())
      .post('/api/files')
      .set('Authorization', `Bearer ${limitedToken}`)
      .attach('file', Buffer.from('hello'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      })
      .expect(403);
  });

  it('uploads a single file and lets only the uploader read metadata', async () => {
    const upload = await request(app.getHttpServer())
      .post('/api/files')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('ok'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    expect(upload.body).toEqual(
      expect.objectContaining({
        originalName: 'note.txt',
        mediaType: 'text/plain',
        sizeBytes: 2,
        status: 'staged',
        uploadedBy: expect.any(String),
      }),
    );
    expect(upload.body.storageKey).not.toContain('note.txt');

    await request(app.getHttpServer())
      .get(`/api/files/${upload.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe(upload.body.id);
      });

    await request(app.getHttpServer())
      .get(`/api/files/${upload.body.id}`)
      .set('Authorization', `Bearer ${filesUserToken}`)
      .expect(404);
  });

  it('rejects forged mime and extra multipart fields', async () => {
    await request(app.getHttpServer())
      .post('/api/files')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('bad'), {
        filename: 'avatar.png',
        contentType: 'image/png',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/files')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('hello'), {
        filename: 'too-large.txt',
        contentType: 'text/plain',
      })
      .expect(413);

    await request(app.getHttpServer())
      .post('/api/files')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('enterpriseId', 'ent-other')
      .attach('file', Buffer.from('ok'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      })
      .expect(400);
  });

  async function login(account: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({ account, password })
      .expect(201);
    return response.body.accessToken;
  }

  async function createAndLoginLimitedUser(): Promise<string> {
    const suffix = Date.now();
    const account = `files-limited-${suffix}`;
    await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enterpriseId: 'ent-default',
        employeeNo: `files-${suffix}`,
        account,
        name: 'Files Limited',
        initialPassword: 'Passw0rd',
      })
      .expect(201);
    return login(account, 'Passw0rd');
  }

  async function createAndLoginFilesUser(): Promise<string> {
    const suffix = Date.now();
    const account = `files-user-${suffix}`;
    const employeeResponse = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enterpriseId: 'ent-default',
        employeeNo: `filesu-${suffix}`,
        account,
        name: 'Files User',
        initialPassword: 'Passw0rd',
      })
      .expect(201);
    const roleResponse = await request(app.getHttpServer())
      .post('/api/platform/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enterpriseId: 'ent-default',
        code: `files-user-${suffix}`,
        name: 'Files user role',
        permissionCodes: ['files:object:upload', 'files:object:view-own'],
        dataScopes: [
          { dataType: 'profile', scope: 'self' },
          { dataType: 'presence', scope: 'self' },
          { dataType: 'report', scope: 'self' },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/api/platform/employees/${employeeResponse.body.id}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleIds: [roleResponse.body.id] })
      .expect(200);
    return login(account, 'Passw0rd');
  }
});
