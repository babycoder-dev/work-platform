import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GatewayModule } from './gateway.module';

describe('people aggregation API', () => {
  let app: INestApplication;
  let root: string;
  let suffix: string;
  let adminToken: string;
  const previousEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    suffix = Date.now().toString();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'work-people-aggregation-e2e-'));
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

  it('upserts and reads profile.employee records by subject with profile scope isolation', async () => {
    const target = await createAndLoginUser(
      ['forms:record:view'],
      [{ dataType: 'profile', scope: 'self' }],
      `people-target-${suffix}`,
    );
    const other = await createAndLoginUser(
      ['forms:record:view', 'forms:record:submit'],
      [{ dataType: 'profile', scope: 'self' }],
      `people-other-${suffix}`,
    );

    await request(app.getHttpServer())
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

    const upserted = await request(app.getHttpServer())
      .put(`/api/forms/records/profile.employee/subjects/${target.employeeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        definitionRevision: 1,
        values: [{ fieldKey: 'nickname', value: '张伟' }],
      })
      .expect(200);

    expect(upserted.body).toEqual(
      expect.objectContaining({
        slotKey: 'profile.employee',
        subjectType: 'employee',
        subjectId: target.employeeId,
        values: [expect.objectContaining({ fieldKey: 'nickname', value: '张伟' })],
      }),
    );

    await request(app.getHttpServer())
      .get(`/api/forms/records/profile.employee/subjects/${target.employeeId}`)
      .set('Authorization', `Bearer ${target.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe(upserted.body.id);
      });

    await request(app.getHttpServer())
      .get(`/api/forms/records/profile.employee/subjects/${target.employeeId}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);

    await request(app.getHttpServer())
      .put(`/api/forms/records/profile.employee/subjects/${target.employeeId}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({
        definitionRevision: 1,
        values: [{ fieldKey: 'nickname', value: '越权' }],
      })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/forms/records/profile.employee/subjects/${target.employeeId}`)
      .set('Authorization', `Bearer ${target.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.values).toEqual([
          expect.objectContaining({ fieldKey: 'nickname', value: '张伟' }),
        ]);
      });
  });

  it('returns current presence record by employee through board scope semantics', async () => {
    const limited = await createAndLoginUser(
      ['presence:board:view'],
      [{ dataType: 'presence', scope: 'self' }],
      `people-presence-${suffix}`,
    );
    const created = await request(app.getHttpServer())
      .post('/api/presence/status-records')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'working',
        startAt: '2026-06-24T00:00:00.000Z',
        endAt: '2026-06-25T00:00:00.000Z',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/presence/status-records/by-employee/${created.body.userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.record).toEqual(expect.objectContaining({ id: created.body.id }));
      });

    await request(app.getHttpServer())
      .get(`/api/presence/status-records/by-employee/${created.body.userId}`)
      .set('Authorization', `Bearer ${limited.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ record: null });
      });
  });

  async function login(account: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({ account, password })
      .expect(201);
    return response.body.accessToken;
  }

  async function createAndLoginUser(
    permissionCodes: string[],
    dataScopes: Array<{ dataType: string; scope: string }>,
    account: string,
  ): Promise<{ employeeId: string; token: string }> {
    const employeeResponse = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
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
          dataScopes,
        })
        .expect(201);
      await request(app.getHttpServer())
        .put(`/api/platform/employees/${employeeResponse.body.id}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleIds: [roleResponse.body.id] })
        .expect(200);
    }

    return { employeeId: employeeResponse.body.id, token: await login(account, 'Passw0rd') };
  }
});
