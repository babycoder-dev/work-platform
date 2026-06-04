import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GatewayModule } from './gateway.module';

const runPostgresE2E = process.env.RUN_POSTGRES_E2E === 'true';
const execFileAsync = promisify(execFile);

describe.skipIf(!runPostgresE2E)('files upload API postgres', () => {
  let app: INestApplication;
  let root: string;
  let adminToken: string;
  const previousEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'work-files-pg-e2e-'));
    for (const key of [
      'FILES_REPOSITORY_DRIVER',
      'FILE_STORAGE_LOCAL_ROOT',
      'FILE_STORAGE_CLEANUP_INTERVAL_MS',
      'FILE_STORAGE_MIN_FREE_BYTES',
      'FILE_STORAGE_MIN_FREE_RATIO',
    ]) {
      previousEnv[key] = process.env[key];
    }
    delete process.env.FILES_REPOSITORY_DRIVER;
    process.env.FILE_STORAGE_LOCAL_ROOT = root;
    process.env.FILE_STORAGE_CLEANUP_INTERVAL_MS = '0';
    process.env.FILE_STORAGE_MIN_FREE_BYTES = '1';
    process.env.FILE_STORAGE_MIN_FREE_RATIO = '0';

    await execFileAsync(
      process.platform === 'win32' ? 'cmd.exe' : 'pnpm',
      process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm db:setup'] : ['db:setup'],
      {
        cwd: process.cwd(),
        env: process.env,
      },
    );

    const moduleRef = await Test.createTestingModule({
      imports: [GatewayModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configurePlatformHttp(app, { globalPrefix: 'api' });
    await app.init();
    adminToken = await login('admin', process.env.PLATFORM_BOOTSTRAP_ADMIN_PASSWORD ?? 'admin123');
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

  it('persists uploaded metadata through postgres-backed files repository', async () => {
    const upload = await request(app.getHttpServer())
      .post('/api/files')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from(`hello-${randomUUID()}`), {
        filename: 'postgres-note.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/files/${upload.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            id: upload.body.id,
            provider: 'local-disk',
            status: 'staged',
            originalName: 'postgres-note.txt',
          }),
        );
      });
  });

  async function login(account: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({ account, password })
      .expect(201);
    return response.body.accessToken;
  }
});
