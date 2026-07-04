import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GatewayModule } from './gateway.module';

describe('presence status type API', () => {
  let app: INestApplication;
  let root: string;
  let adminToken: string;
  let createOnlyToken: string;
  let customTypeId: string;
  const previousEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'work-presence-status-types-'));
    for (const key of [
      'PLATFORM_REPOSITORY_DRIVER',
      'FILES_REPOSITORY_DRIVER',
      'FORMS_REPOSITORY_DRIVER',
      'NOTIFICATION_REPOSITORY_DRIVER',
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
    process.env.NOTIFICATION_REPOSITORY_DRIVER = 'memory';
    process.env.FILE_STORAGE_LOCAL_ROOT = root;
    process.env.FILE_STORAGE_CLEANUP_INTERVAL_MS = '0';
    process.env.FILE_STORAGE_MIN_FREE_BYTES = '1';
    process.env.FILE_STORAGE_MIN_FREE_RATIO = '0';

    const moduleRef = await Test.createTestingModule({ imports: [GatewayModule] }).compile();
    app = moduleRef.createNestApplication();
    configurePlatformHttp(app, { globalPrefix: 'api' });
    await app.init();
    adminToken = await login('admin', 'admin123');
    createOnlyToken = await createUserWithPermissions(['presence:status:create']);
  });

  afterAll(async () => {
    await app?.close();
    await fs.rm(root, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('lists presets and completes create, update, archive, and restore lifecycle', async () => {
    await request(app.getHttpServer()).get('/api/presence/status-types').expect(401);

    const presets = await request(app.getHttpServer())
      .get('/api/presence/status-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(presets.body).toHaveLength(5);
    expect(presets.body[0]).toMatchObject({ key: 'working', isDefault: true });

    const created = await request(app.getHttpServer())
      .post('/api/presence/status-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'vip_visit', label: '贵宾接待', sortOrder: 60 })
      .expect(201);
    customTypeId = created.body.id;

    await request(app.getHttpServer())
      .post('/api/presence/status-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'Invalid-Key', label: '非法' })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/presence/status-types/${customTypeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: '贵宾来访' })
      .expect(200)
      .expect((response) => expect(response.body.label).toBe('贵宾来访'));

    await request(app.getHttpServer())
      .post(`/api/presence/status-types/${customTypeId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const all = await request(app.getHttpServer())
      .get('/api/presence/status-types/all')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(all.body).toContainEqual(
      expect.objectContaining({ id: customTypeId, status: 'archived' }),
    );
    const active = await request(app.getHttpServer())
      .get('/api/presence/status-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(active.body).not.toContainEqual(expect.objectContaining({ id: customTypeId }));

    await request(app.getHttpServer())
      .post(`/api/presence/status-types/${customTypeId}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });

  it('allows create-only users to list active types but denies every management mutation', async () => {
    await request(app.getHttpServer())
      .get('/api/presence/status-types')
      .set('Authorization', `Bearer ${createOnlyToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/presence/status-types/all')
      .set('Authorization', `Bearer ${createOnlyToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/presence/status-types')
      .set('Authorization', `Bearer ${createOnlyToken}`)
      .send({ key: 'denied', label: '禁止' })
      .expect(403);
    for (const [method, url] of [
      ['patch', `/api/presence/status-types/${customTypeId}`],
      ['post', `/api/presence/status-types/${customTypeId}/default`],
      ['post', `/api/presence/status-types/${customTypeId}/archive`],
      ['post', `/api/presence/status-types/${customTypeId}/restore`],
    ] as const) {
      const client = request(app.getHttpServer());
      await client[method](url)
        .set('Authorization', `Bearer ${createOnlyToken}`)
        .send(method === 'patch' ? { label: '禁止' } : undefined)
        .expect(403);
    }
  });

  it('rejects client-controlled default and invalid registration keys', async () => {
    await request(app.getHttpServer())
      .post('/api/presence/status-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'forged_default', label: '伪造', isDefault: true })
      .expect(400);

    const now = Date.now();
    const payload = (status: string) => ({
      status,
      startAt: new Date(now - 60_000).toISOString(),
      endAt: new Date(now + 60_000).toISOString(),
    });
    await request(app.getHttpServer())
      .post('/api/presence/status-records')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload('vip_visit'))
      .expect(201)
      .expect((response) => expect(response.body.status).toBe('vip_visit'));
    await request(app.getHttpServer())
      .post('/api/presence/status-records')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload('working'))
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/presence/status-records')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload('unknown_key'))
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/presence/status-types/${customTypeId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/presence/status-records')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload('vip_visit'))
      .expect(400);
  });

  async function login(account: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({ account, password })
      .expect(201);
    return response.body.accessToken;
  }

  async function createUserWithPermissions(permissionCodes: string[]): Promise<string> {
    const suffix = Date.now().toString();
    const employee = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeNo: `PST${suffix}`.slice(0, 20),
        account: `presence-status-${suffix}`,
        name: 'Status User',
        initialPassword: 'Passw0rd',
      })
      .expect(201);
    const role = await request(app.getHttpServer())
      .post('/api/platform/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enterpriseId: 'ent-default',
        code: `presence-status-${suffix}`,
        name: 'Presence status create only',
        permissionCodes,
        dataScopes: [{ dataType: 'presence', scope: 'self' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/api/platform/employees/${employee.body.id}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleIds: [role.body.id] })
      .expect(200);
    return login(`presence-status-${suffix}`, 'Passw0rd');
  }
});
