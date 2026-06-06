import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GatewayModule } from './gateway.module';

describe('forms definition API', () => {
  let app: INestApplication;
  let root: string;
  let adminToken: string;
  let limitedToken: string;
  let reportManagerToken: string;
  let suffix: string;
  const previousEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    suffix = Date.now().toString();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'work-forms-e2e-'));
    for (const key of [
      'PLATFORM_REPOSITORY_DRIVER',
      'FILES_REPOSITORY_DRIVER',
      'FORMS_REPOSITORY_DRIVER',
      'FILE_STORAGE_LOCAL_ROOT',
      'FILE_STORAGE_CLEANUP_INTERVAL_MS',
      'FILE_STORAGE_MIN_FREE_BYTES',
      'FILE_STORAGE_MIN_FREE_RATIO',
    ]) {
      previousEnv[key] = process.env[key];
    }
    process.env.PLATFORM_REPOSITORY_DRIVER = 'memory';
    process.env.FILES_REPOSITORY_DRIVER = 'memory';
    process.env.FORMS_REPOSITORY_DRIVER = 'memory';
    process.env.FILE_STORAGE_LOCAL_ROOT = root;
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
    limitedToken = await createAndLoginUser([], `forms-limited-${suffix}`);
    reportManagerToken = await createAndLoginUser(
      ['forms:report-definition:view', 'forms:report-definition:manage'],
      `forms-report-${suffix}`,
    );
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

  it('enforces authentication and dynamic definition permissions', async () => {
    await request(app.getHttpServer()).get('/api/forms/definitions/profile.employee').expect(401);

    await request(app.getHttpServer())
      .get('/api/forms/definitions/profile.employee')
      .set('Authorization', `Bearer ${limitedToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/forms/definitions/profile.employee')
      .set('Authorization', `Bearer ${reportManagerToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/forms/definitions/report.daily')
      .set('Authorization', `Bearer ${reportManagerToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            slotKey: 'report.daily',
            ownerModule: 'report',
            revision: 0,
            fields: [],
          }),
        );
      });
  });

  it('returns 404 for unknown and reserved slots before permission checks', async () => {
    for (const slotKey of ['missing.slot', 'report.weekly', 'presence.status.business_trip']) {
      await request(app.getHttpServer())
        .get(`/api/forms/definitions/${encodeURIComponent(slotKey)}`)
        .set('Authorization', `Bearer ${limitedToken}`)
        .expect(404);
    }
  });

  it('updates active definitions with server-derived owner module and optimistic revision', async () => {
    const initial = await request(app.getHttpServer())
      .get('/api/forms/definitions/profile.employee')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(initial.body).toEqual(
      expect.objectContaining({
        slotKey: 'profile.employee',
        ownerModule: 'profile',
        revision: 0,
        fields: [],
      }),
    );

    const updated = await request(app.getHttpServer())
      .put('/api/forms/definitions/profile.employee')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        revision: 0,
        fields: [
          {
            fieldKey: 'nickname',
            label: '昵称',
            fieldType: 'text',
            required: true,
            sortOrder: 1,
          },
        ],
      })
      .expect(200);

    expect(updated.body).toEqual(
      expect.objectContaining({
        slotKey: 'profile.employee',
        ownerModule: 'profile',
        revision: 1,
        fields: [
          expect.objectContaining({
            fieldKey: 'nickname',
            label: '昵称',
            fieldType: 'text',
            required: true,
          }),
        ],
      }),
    );

    await request(app.getHttpServer())
      .put('/api/forms/definitions/profile.employee')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ revision: 0, fields: [] })
      .expect(409);
  });

  it('rejects invalid definition payloads', async () => {
    await request(app.getHttpServer())
      .put('/api/forms/definitions/profile.employee')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        revision: 1,
        fields: [
          {
            fieldKey: 'bad-select',
            label: '坏选项',
            fieldType: 'single_select',
            required: false,
            sortOrder: 1,
            options: [],
          },
        ],
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

  async function createAndLoginUser(permissionCodes: string[], account: string): Promise<string> {
    const employeeResponse = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enterpriseId: 'ent-default',
        employeeNo: account.slice(0, 20),
        account,
        name: account,
        initialPassword: 'Passw0rd',
      })
      .expect(201);

    if (permissionCodes.length > 0) {
      const roleResponse = await request(app.getHttpServer())
        .post('/api/platform/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          enterpriseId: 'ent-default',
          code: `${account}-role`,
          name: `${account} role`,
          permissionCodes,
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
    }

    return login(account, 'Passw0rd');
  }
});
