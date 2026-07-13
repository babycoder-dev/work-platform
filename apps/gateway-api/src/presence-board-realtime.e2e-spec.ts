import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GatewayModule } from './gateway.module';

const testUserPassword = ['M9', 'Board', '123', '!'].join('');

describe('presence board realtime roster', () => {
  let app: INestApplication;
  let root: string;
  let suffix: string;
  let adminToken: string;
  const previousEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    suffix = Date.now().toString();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'work-presence-board-e2e-'));
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
  });

  afterAll(async () => {
    await app?.close();
    await fs.rm(root, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('lists scoped rosters with default rows and hides out-of-scope employees', async () => {
    const d1 = await createDepartment(`BR-D1-${suffix}`, 'Board D1');
    const d2 = await createDepartment(`BR-D2-${suffix}`, 'Board D2');
    const d1Viewer = await createUser({
      account: `board-d1-viewer-${suffix}`,
      departmentId: d1.id,
      permissions: ['presence:board:view'],
      dataScope: 'department',
    });
    const d1Active = await createUser({
      account: `board-d1-active-${suffix}`,
      departmentId: d1.id,
      permissions: ['presence:status:create'],
      dataScope: 'self',
    });
    const d1Default = await createUser({
      account: `board-d1-default-${suffix}`,
      departmentId: d1.id,
      permissions: ['presence:board:view'],
      dataScope: 'self',
    });
    const d2User = await createUser({
      account: `board-d2-user-${suffix}`,
      departmentId: d2.id,
      permissions: [],
      dataScope: 'self',
    });

    await register(d1Active.token, { status: 'business_trip' });

    const departmentBoard = await board(d1Viewer.token);
    expect(employeeNos(departmentBoard)).toEqual(
      expect.arrayContaining([d1Viewer.employeeNo, d1Active.employeeNo, d1Default.employeeNo]),
    );
    expect(employeeNos(departmentBoard)).not.toContain(d2User.employeeNo);
    expect(rowByEmployeeNo(departmentBoard, d1Default.employeeNo)).toEqual(
      expect.objectContaining({ isDefault: true, status: 'working', statusLabel: '在岗' }),
    );
    expect(rowByEmployeeNo(departmentBoard, d1Active.employeeNo)).toEqual(
      expect.objectContaining({
        isDefault: false,
        status: 'business_trip',
        statusLabel: '出差',
        recordId: expect.any(String),
      }),
    );

    const companyBoard = await board(adminToken);
    expect(employeeNos(companyBoard)).toEqual(
      expect.arrayContaining([
        d1Viewer.employeeNo,
        d1Active.employeeNo,
        d1Default.employeeNo,
        d2User.employeeNo,
      ]),
    );

    const selfBoard = await board(d1Default.token);
    expect(employeeNos(selfBoard)).toEqual([d1Default.employeeNo]);
    expect(selfBoard.body.items[0]).toEqual(expect.objectContaining({ isDefault: true }));
  });

  it('includes descendant departments for tree scope and excludes sibling trees', async () => {
    const parent = await createDepartment(`BR-P-${suffix}`, 'Board Parent');
    const child = await createDepartment(`BR-C-${suffix}`, 'Board Child', parent.id);
    const sibling = await createDepartment(`BR-Q-${suffix}`, 'Board Sibling');
    const treeViewer = await createUser({
      account: `board-tree-viewer-${suffix}`,
      departmentId: parent.id,
      permissions: ['presence:board:view'],
      dataScope: 'department_tree',
    });
    const childUser = await createUser({
      account: `board-child-${suffix}`,
      departmentId: child.id,
      permissions: [],
      dataScope: 'self',
    });
    const siblingUser = await createUser({
      account: `board-sibling-${suffix}`,
      departmentId: sibling.id,
      permissions: [],
      dataScope: 'self',
    });

    const response = await board(treeViewer.token);

    expect(employeeNos(response)).toEqual(
      expect.arrayContaining([treeViewer.employeeNo, childUser.employeeNo]),
    );
    expect(employeeNos(response)).not.toContain(siblingUser.employeeNo);
  });

  it('moves board visibility with realtime employee department instead of record snapshot', async () => {
    const d1 = await createDepartment(`BR-M1-${suffix}`, 'Board Move D1');
    const d2 = await createDepartment(`BR-M2-${suffix}`, 'Board Move D2');
    const d1Viewer = await createUser({
      account: `board-move-d1-viewer-${suffix}`,
      departmentId: d1.id,
      permissions: ['presence:board:view'],
      dataScope: 'department',
    });
    const d2Viewer = await createUser({
      account: `board-move-d2-viewer-${suffix}`,
      departmentId: d2.id,
      permissions: ['presence:board:view'],
      dataScope: 'department',
    });
    const mover = await createUser({
      account: `board-mover-${suffix}`,
      departmentId: d1.id,
      permissions: ['presence:status:create'],
      dataScope: 'self',
    });
    await register(mover.token, { status: 'business_trip' });

    await request(app.getHttpServer())
      .put(`/api/platform/employees/${mover.id}/profile`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ departmentId: d2.id })
      .expect(200);

    expect(employeeNos(await board(d1Viewer.token))).not.toContain(mover.employeeNo);
    const d2Board = await board(d2Viewer.token);
    expect(rowByEmployeeNo(d2Board, mover.employeeNo)).toEqual(
      expect.objectContaining({
        isDefault: false,
        departmentId: d2.id,
        departmentName: 'Board Move D2',
      }),
    );
  });

  it('uses dictionary labels and does not leak forms values through board rows', async () => {
    const department = await createDepartment(`BR-F-${suffix}`, 'Board Forms');
    const employee = await createUser({
      account: `board-form-employee-${suffix}`,
      departmentId: department.id,
      permissions: [
        'presence:status:create',
        'forms:record:submit',
        'forms:record:view',
        'forms:presence-definition:view',
      ],
      dataScope: 'company',
    });
    await request(app.getHttpServer())
      .post('/api/presence/status-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: `vip_visit_${suffix}`, label: '贵宾接待', sortOrder: 60 })
      .expect(201);
    const definition = await request(app.getHttpServer())
      .put(`/api/forms/definitions/presence.status.vip_visit_${suffix}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        revision: 0,
        fields: [
          {
            fieldKey: 'destination',
            label: '目的地',
            fieldType: 'text',
            required: true,
            sortOrder: 1,
          },
        ],
      })
      .expect(200);

    await register(employee.token, {
      status: `vip_visit_${suffix}`,
      form: {
        definitionRevision: definition.body.revision,
        values: [{ fieldKey: 'destination', value: 'SECRET_DESTINATION' }],
      },
    });

    const response = await board(adminToken);
    const row = rowByEmployeeNo(response, employee.employeeNo);
    expect(row).toEqual(
      expect.objectContaining({
        status: `vip_visit_${suffix}`,
        statusLabel: '贵宾接待',
        formRecordId: expect.any(String),
      }),
    );
    expect(JSON.stringify(response.body)).not.toContain('SECRET_DESTINATION');
    expect(
      response.body.items
        .filter((item: { isDefault: boolean }) => item.isDefault)
        .every((item: { formRecordId?: string }) => item.formRecordId === undefined),
    ).toBe(true);
  });

  async function createDepartment(code: string, name: string, parentId?: string) {
    const response = await request(app.getHttpServer())
      .post('/api/platform/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, name, parentId })
      .expect(201);
    return response.body as { id: string; name: string };
  }

  async function createUser(input: {
    account: string;
    departmentId: string;
    permissions: string[];
    dataScope: 'self' | 'department' | 'department_tree' | 'company';
  }) {
    const employeeNo = input.account.slice(0, 20);
    const employee = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        departmentId: input.departmentId,
        employeeNo,
        account: input.account,
        name: input.account,
        initialPassword: testUserPassword,
      })
      .expect(201);
    if (input.permissions.length > 0) {
      const role = await request(app.getHttpServer())
        .post('/api/platform/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          enterpriseId: 'ent-default',
          code: `${input.account}-role`,
          name: `${input.account} role`,
          permissionCodes: input.permissions,
          dataScopes: [{ dataType: 'presence', scope: input.dataScope }],
        })
        .expect(201);
      await request(app.getHttpServer())
        .put(`/api/platform/employees/${employee.body.id}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleIds: [role.body.id] })
        .expect(200);
    }
    return {
      id: employee.body.id as string,
      employeeNo,
      token: await login(input.account, testUserPassword),
    };
  }

  async function register(token: string, input: { status: string; form?: unknown }) {
    const now = Date.now();
    return request(app.getHttpServer())
      .post('/api/presence/status-records')
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: input.status,
        startAt: new Date(now - 60_000).toISOString(),
        endAt: new Date(now + 3_600_000).toISOString(),
        ...(input.form === undefined ? {} : { form: input.form }),
      })
      .expect(201);
  }

  async function board(token: string) {
    return request(app.getHttpServer())
      .get('/api/presence/board')
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

  function employeeNos(response: { body: { items: Array<{ employeeNo: string }> } }) {
    return response.body.items.map((item) => item.employeeNo);
  }

  function rowByEmployeeNo(
    response: { body: { items: Array<{ employeeNo: string }> } },
    employeeNo: string,
  ) {
    return response.body.items.find((item) => item.employeeNo === employeeNo);
  }
});
