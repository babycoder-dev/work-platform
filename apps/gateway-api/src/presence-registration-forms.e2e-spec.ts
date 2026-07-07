import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GatewayModule } from './gateway.module';

describe('presence registration with forms', () => {
  let app: INestApplication;
  let root: string;
  let adminToken: string;
  let employee: { id: string; token: string };
  let otherEmployee: { id: string; token: string };
  let noSubmitEmployee: { id: string; token: string };
  const suffix = Date.now().toString();
  const previousEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'work-presence-forms-e2e-'));
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
    employee = await createAndLoginUser(
      [
        'presence:status:create',
        'forms:record:submit',
        'forms:record:view',
        'forms:presence-definition:view',
      ],
      `presence-form-${suffix}`,
    );
    otherEmployee = await createAndLoginUser(
      ['presence:status:create', 'forms:record:view', 'forms:presence-definition:view'],
      `presence-other-${suffix}`,
    );
    noSubmitEmployee = await createAndLoginUser(
      ['presence:status:create', 'forms:record:view', 'forms:presence-definition:view'],
      `presence-no-submit-${suffix}`,
    );
  });

  afterAll(async () => {
    await app?.close();
    await fs.rm(root, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('configures a preset status form, appends records, and enforces by-id scope', async () => {
    const definition = await configureDefinition('business_trip', 'destination');

    await request(app.getHttpServer())
      .get('/api/forms/definitions/presence.status.business_trip')
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(200);

    const first = await register(employee.token, {
      status: 'business_trip',
      startAt: '2031-01-01T08:00:00.000Z',
      endAt: '2031-01-01T10:00:00.000Z',
      form: {
        definitionRevision: definition.revision,
        values: [{ fieldKey: 'destination', value: '上海' }],
      },
    });
    expect(first.body.formRecordId).toEqual(expect.any(String));

    const firstForm = await request(app.getHttpServer())
      .get(`/api/forms/records/by-id/${first.body.formRecordId}`)
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(200);
    expect(firstForm.body.values).toEqual([
      expect.objectContaining({ fieldKey: 'destination', value: '上海' }),
    ]);

    const second = await register(employee.token, {
      status: 'business_trip',
      startAt: '2031-01-02T08:00:00.000Z',
      endAt: '2031-01-02T10:00:00.000Z',
      form: {
        definitionRevision: definition.revision,
        values: [{ fieldKey: 'destination', value: '北京' }],
      },
    });
    expect(second.body.formRecordId).not.toBe(first.body.formRecordId);
    await request(app.getHttpServer())
      .get(`/api/forms/records/by-id/${second.body.formRecordId}`)
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.values).toEqual([
          expect.objectContaining({ fieldKey: 'destination', value: '北京' }),
        ]);
      });

    await request(app.getHttpServer())
      .get(`/api/forms/records/by-id/${first.body.formRecordId}`)
      .set('Authorization', `Bearer ${otherEmployee.token}`)
      .expect(404);
  });

  it('keeps legacy registration unchanged and prevents client-controlled form links', async () => {
    const injectedId = '11111111-1111-4111-8111-111111111111';
    const legacy = await register(employee.token, {
      status: 'business_trip',
      startAt: '2031-01-03T08:00:00.000Z',
      endAt: '2031-01-03T10:00:00.000Z',
      remark: '不带表单',
      formRecordId: injectedId,
    });
    expect(legacy.body.formRecordId).toBeUndefined();
    expect(legacy.body.formRecordId).not.toBe(injectedId);
  });

  it('does not create presence when forms rejects revision or submit permission', async () => {
    const before = await ownRecords(employee.token);
    await request(app.getHttpServer())
      .post('/api/presence/status-records')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({
        status: 'business_trip',
        startAt: '2031-01-04T08:00:00.000Z',
        endAt: '2031-01-04T10:00:00.000Z',
        form: {
          definitionRevision: 0,
          values: [{ fieldKey: 'destination', value: '过期版本' }],
        },
      })
      .expect(409);
    expect((await ownRecords(employee.token)).body.items).toHaveLength(before.body.items.length);

    const noSubmitBefore = await ownRecords(noSubmitEmployee.token);
    await request(app.getHttpServer())
      .post('/api/presence/status-records')
      .set('Authorization', `Bearer ${noSubmitEmployee.token}`)
      .send({
        status: 'business_trip',
        startAt: '2031-01-05T08:00:00.000Z',
        endAt: '2031-01-05T10:00:00.000Z',
        form: {
          definitionRevision: 1,
          values: [{ fieldKey: 'destination', value: '缺权限' }],
        },
      })
      .expect(404);
    expect((await ownRecords(noSubmitEmployee.token)).body.items).toHaveLength(
      noSubmitBefore.body.items.length,
    );
  });

  it('supports runtime-created status keys through the same server-derived slot chain', async () => {
    await request(app.getHttpServer())
      .post('/api/presence/status-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'vip_visit', label: '贵宾接待', sortOrder: 60 })
      .expect(201);
    const definition = await configureDefinition('vip_visit', 'visitor');

    const created = await register(employee.token, {
      status: 'vip_visit',
      startAt: '2031-01-06T08:00:00.000Z',
      endAt: '2031-01-06T10:00:00.000Z',
      form: {
        definitionRevision: definition.revision,
        values: [{ fieldKey: 'visitor', value: '客户 A' }],
      },
    });
    await request(app.getHttpServer())
      .get(`/api/forms/records/by-id/${created.body.formRecordId}`)
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.slotKey).toBe('presence.status.vip_visit');
        expect(response.body.values).toEqual([
          expect.objectContaining({ fieldKey: 'visitor', value: '客户 A' }),
        ]);
      });
  });

  async function configureDefinition(statusKey: string, fieldKey: string) {
    const response = await request(app.getHttpServer())
      .put(`/api/forms/definitions/presence.status.${statusKey}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        revision: 0,
        fields: [
          {
            fieldKey,
            label: fieldKey,
            fieldType: 'text',
            required: true,
            sortOrder: 1,
          },
        ],
      })
      .expect(200);
    return response.body;
  }

  async function register(token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/presence/status-records')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
  }

  async function ownRecords(token: string) {
    return request(app.getHttpServer())
      .get('/api/presence/status-records/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  async function login(account: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({ account, password })
      .expect(201);
    return response.body.accessToken;
  }

  async function createAndLoginUser(
    permissionCodes: string[],
    account: string,
  ): Promise<{ id: string; token: string }> {
    const department = await request(app.getHttpServer())
      .post('/api/platform/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `D-${account}`.slice(0, 64), name: `部门 ${account}` })
      .expect(201);
    const employeeResponse = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        departmentId: department.body.id,
        employeeNo: account.slice(0, 20),
        account,
        name: account,
        initialPassword: 'Passw0rd',
      })
      .expect(201);
    const roleResponse = await request(app.getHttpServer())
      .post('/api/platform/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enterpriseId: 'ent-default',
        code: `${account}-role`,
        name: `${account} role`,
        permissionCodes,
        dataScopes: [{ dataType: 'presence', scope: 'self' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/api/platform/employees/${employeeResponse.body.id}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleIds: [roleResponse.body.id] })
      .expect(200);
    return { id: employeeResponse.body.id, token: await login(account, 'Passw0rd') };
  }
});
