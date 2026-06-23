import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PlatformModule } from './platform.module';
import { verifyPassword } from './security/secret-hash';
import { DEFAULT_ADMIN_USER_ID } from './seeds/seed-data';
import { PlatformMemoryStore } from './store/platform-memory.store';

describe('platform-api', () => {
  let app: INestApplication;
  let memoryStore: PlatformMemoryStore;
  let previousRepositoryDriver: string | undefined;

  beforeAll(async () => {
    previousRepositoryDriver = process.env.PLATFORM_REPOSITORY_DRIVER;
    process.env.PLATFORM_REPOSITORY_DRIVER = 'memory';

    const moduleRef = await Test.createTestingModule({
      imports: [PlatformModule],
    }).compile();

    app = moduleRef.createNestApplication();
    memoryStore = moduleRef.get(PlatformMemoryStore);
    configurePlatformHttp(app, { globalPrefix: 'api/platform' });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (previousRepositoryDriver === undefined) {
      delete process.env.PLATFORM_REPOSITORY_DRIVER;
    } else {
      process.env.PLATFORM_REPOSITORY_DRIVER = previousRepositoryDriver;
    }
  });

  it('logs in and returns current user permissions', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account: 'admin',
        password: 'admin123',
      })
      .expect(201);

    expect(response.body.accessToken).toContain('dev-access-');
    expect(response.body.user.name).toBe('系统管理员');
    expect(response.body.user.permissions.length).toBeGreaterThan(0);
  });

  it('rejects protected endpoints without access token', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/platform/departments')
      .expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'HTTP_401',
        message: '未登录',
      }),
    );
  });

  it('rejects current user menu requests without access token', async () => {
    const response = await request(app.getHttpServer()).get('/api/platform/menus/my').expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'HTTP_401',
        message: '未登录',
      }),
    );
  });

  it('rejects protected endpoints with malformed authorization header', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/platform/departments')
      .set('Authorization', 'Token not-a-bearer-token')
      .expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'HTTP_401',
        message: '未登录',
      }),
    );
  });

  it('rejects protected endpoints with unknown access token', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/platform/departments')
      .set('Authorization', 'Bearer dev-access-missing')
      .expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'HTTP_401',
        message: '登录状态无效',
      }),
    );
  });

  it('lists departments with access token', async () => {
    const token = await loginAsAdmin();
    const response = await request(app.getHttpServer())
      .get('/api/platform/departments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'HQ',
          name: '总部',
        }),
      ]),
    );
  });

  it('updates, moves, and deletes departments with occupancy and cycle guards', async () => {
    const token = await loginAsAdmin();
    const suffix = Date.now().toString();
    const manager = await createEmployee(token, {
      employeeNo: `MGR${suffix}`,
      account: `manager-${suffix}`,
      name: '部门负责人',
    });
    const parent = await createDepartment(token, `ORG-P-${suffix}`, '父部门');
    const child = await createDepartment(token, `ORG-C-${suffix}`, '子部门', parent.body.id);

    const updateResponse = await request(app.getHttpServer())
      .put(`/api/platform/departments/${child.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '子部门改名',
        parentId: null,
        managerUserId: manager.body.id,
        sortOrder: 12,
      })
      .expect(200);

    expect(updateResponse.body).toEqual(
      expect.objectContaining({
        id: child.body.id,
        name: '子部门改名',
        managerUserId: manager.body.id,
        sortOrder: 12,
      }),
    );
    expect(updateResponse.body.parentId).toBeUndefined();

    await request(app.getHttpServer())
      .put(`/api/platform/departments/${parent.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parentId: parent.body.id })
      .expect(400);

    await request(app.getHttpServer())
      .put(`/api/platform/departments/${child.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parentId: parent.body.id })
      .expect(200);

    const occupiedDelete = await request(app.getHttpServer())
      .delete(`/api/platform/departments/${parent.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
    expect(occupiedDelete.body).toEqual(
      expect.objectContaining({
        code: 'PLATFORM_DEPARTMENT_NOT_EMPTY',
        message: '部门下仍有人员或子部门，无法删除',
      }),
    );

    await request(app.getHttpServer())
      .delete(`/api/platform/departments/${child.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/platform/departments/${parent.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const listResponse = await request(app.getHttpServer())
      .get('/api/platform/departments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listResponse.body.items).not.toContainEqual(
      expect.objectContaining({ id: parent.body.id }),
    );
    expect(listResponse.body.items).not.toContainEqual(
      expect.objectContaining({ id: child.body.id }),
    );
  });

  it('derives department tenant from the authenticated user and validates nullable update fields', async () => {
    const token = await loginAsAdmin();
    const suffix = Date.now().toString();

    const noTenantResponse = await request(app.getHttpServer())
      .post('/api/platform/departments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `ORG-NO-TENANT-${suffix}`,
        name: '认证租户部门',
      })
      .expect(201);
    expect(noTenantResponse.body.enterpriseId).toBe('ent-default');

    const rejectedTenantResponse = await request(app.getHttpServer())
      .post('/api/platform/departments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        enterpriseId: 'ent-other',
        code: `ORG-IGNORE-TENANT-${suffix}`,
        name: '忽略请求租户部门',
      })
      .expect(400);
    expect(rejectedTenantResponse.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'HTTP_400',
      }),
    );

    await request(app.getHttpServer())
      .put(`/api/platform/departments/${noTenantResponse.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: null })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/api/platform/departments/${noTenantResponse.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/api/platform/departments/${noTenantResponse.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sortOrder: null })
      .expect(400);
  });

  it('requires org manage permission for department mutation endpoints', async () => {
    const adminToken = await loginAsAdmin();
    const suffix = Date.now().toString();
    const roleResponse = await createRoleWithPermissions(adminToken, `org-view-${suffix}`, [
      'platform:org:view',
    ]);
    const employeeResponse = await createEmployee(adminToken, {
      employeeNo: `OV${suffix}`,
      account: `org-viewer-${suffix}`,
      name: '组织只读',
      roleIds: [roleResponse.body.id],
    });
    const viewerLogin = await login(`org-viewer-${suffix}`);
    const department = await createDepartment(adminToken, `ORG-R-${suffix}`, '权限部门');

    await request(app.getHttpServer())
      .put(`/api/platform/departments/${department.body.id}`)
      .set('Authorization', `Bearer ${viewerLogin.body.accessToken}`)
      .send({ name: '无权改名' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/platform/departments/${department.body.id}`)
      .set('Authorization', `Bearer ${viewerLogin.body.accessToken}`)
      .expect(403);

    expect(employeeResponse.body.id).toBeTruthy();
  });

  it('returns the current user from an existing access token', async () => {
    const token = await loginAsAdmin();
    const response = await request(app.getHttpServer())
      .get('/api/platform/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        account: 'admin',
        name: '系统管理员',
      }),
    );
    expect(response.body.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'platform:org:view',
        }),
      ]),
    );
  });

  it('lists menus allowed by the current user permissions', async () => {
    const token = await loginAsAdmin();
    const response = await request(app.getHttpServer())
      .get('/api/platform/menus/my')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '组织架构',
          permissionCode: 'platform:org:view',
        }),
        expect.objectContaining({
          title: '在位看板',
          permissionCode: 'presence:board:view',
        }),
        expect.objectContaining({
          title: '状态登记',
          permissionCode: 'presence:status:create',
        }),
      ]),
    );
  });

  it('lists module manifests for users with platform permission visibility', async () => {
    const token = await loginAsAdmin();
    const response = await request(app.getHttpServer())
      .get('/api/platform/module-manifests')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'platform',
          apiPrefix: '/api/platform',
          status: 'active',
        }),
        expect.objectContaining({
          moduleName: 'presence',
          apiPrefix: '/api/presence',
          status: 'active',
        }),
      ]),
    );
    const returnedModuleNames = (response.body.items as Array<{ moduleName: string }>).map(
      (item) => item.moduleName,
    );
    expect(returnedModuleNames).not.toContain('approval');
    expect(returnedModuleNames).not.toContain('report');
  });

  it('rejects users without required permissions', async () => {
    const adminToken = await loginAsAdmin();
    await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeNo: '000099',
        account: 'limited-user',
        name: '受限用户',
        initialPassword: 'Passw0rd',
      })
      .expect(201);

    const limitedLogin = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account: 'limited-user',
        password: 'Passw0rd',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/platform/departments')
      .set('Authorization', `Bearer ${limitedLogin.body.accessToken}`)
      .expect(403);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'HTTP_403',
        message: '权限不足',
      }),
    );

    const menusResponse = await request(app.getHttpServer())
      .get('/api/platform/menus/my')
      .set('Authorization', `Bearer ${limitedLogin.body.accessToken}`)
      .expect(200);
    expect(menusResponse.body.items).toEqual([]);

    await request(app.getHttpServer())
      .get('/api/platform/module-manifests')
      .set('Authorization', `Bearer ${limitedLogin.body.accessToken}`)
      .expect(403);
  });

  it('rejects invalid request bodies with normalized validation errors', async () => {
    const token = await loginAsAdmin();
    const response = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Trace-Id', 'trace-validation-e2e')
      .send({
        enterpriseId: 'ent-default',
        employeeNo: '000100',
        account: 'invalid-user',
        name: '非法用户',
        initialPassword: 'short',
        unknownField: 'should-be-rejected',
      })
      .expect(400);

    expect(response.headers['x-trace-id']).toBe('trace-validation-e2e');
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'HTTP_400',
        traceId: 'trace-validation-e2e',
      }),
    );
    expect(response.body.message).toContain('initialPassword');
    expect(response.body.message).toContain('unknownField');
  });

  it('creates employees from authenticated tenant and rejects client-supplied enterpriseId', async () => {
    const token = await loginAsAdmin();
    const suffix = Date.now().toString();

    const created = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeNo: `TEN${suffix}`,
        account: `tenant-user-${suffix}`,
        name: '租户派生员工',
        initialPassword: 'Passw0rd1',
      })
      .expect(201);
    expect(created.body.enterpriseId).toBe('ent-default');

    const rejected = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        enterpriseId: 'ent-other',
        employeeNo: `TEN-X-${suffix}`,
        account: `tenant-user-x-${suffix}`,
        name: '伪造租户员工',
        initialPassword: 'Passw0rd1',
      })
      .expect(400);
    expect(rejected.body.message).toContain('enterpriseId');
  });

  it('reads and updates employee profiles through me and managed routes with profile scope', async () => {
    await request(app.getHttpServer()).get('/api/platform/employees/me').expect(401);

    const token = await loginAsAdmin();
    const suffix = Date.now().toString();
    const department = await createDepartment(token, `PROF-${suffix}`, '档案部门');
    const outsideDepartment = await createDepartment(token, `PROF-X-${suffix}`, '档案外部部门');
    const role = await createRoleWithPermissions(
      token,
      `profile-manager-${suffix}`,
      ['platform:employee:view', 'platform:employee:manage'],
      'department',
    );
    const manager = await createEmployee(token, {
      departmentId: department.body.id,
      employeeNo: `PM${suffix}`,
      account: `profile-manager-${suffix}`,
      name: '档案管理员',
      roleIds: [role.body.id],
    });
    const target = await createEmployee(token, {
      departmentId: department.body.id,
      employeeNo: `PT${suffix}`,
      account: `profile-target-${suffix}`,
      name: '档案目标',
      title: '旧职务',
      mobile: '13800000000',
      email: 'old-profile@example.com',
    });
    const outside = await createEmployee(token, {
      departmentId: outsideDepartment.body.id,
      employeeNo: `PO${suffix}`,
      account: `profile-outside-${suffix}`,
      name: '档案外部',
    });
    const managerToken = (await login(manager.body.account)).body.accessToken as string;

    const self = await request(app.getHttpServer())
      .get('/api/platform/employees/me')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(self.body.id).toBe(manager.body.id);
    expect(self.body.registrationStatus).toBeUndefined();

    const rejectedSelfWrite = await request(app.getHttpServer())
      .put('/api/platform/employees/me/profile')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ departmentId: outsideDepartment.body.id })
      .expect(400);
    expect(rejectedSelfWrite.body.message).toContain('departmentId');

    const selfUpdate = await request(app.getHttpServer())
      .put('/api/platform/employees/me/profile')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        title: null,
        mobile: '13900000000',
      })
      .expect(200);
    expect(selfUpdate.body.departmentId).toBe(department.body.id);
    expect(selfUpdate.body.title).toBeUndefined();
    expect(selfUpdate.body.mobile).toBe('13900000000');

    const managedUpdate = await request(app.getHttpServer())
      .put(`/api/platform/employees/${target.body.id}/profile`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: '档案目标更新',
        title: null,
        email: 'new-profile@example.com',
      })
      .expect(200);
    expect(managedUpdate.body).toEqual(
      expect.objectContaining({
        id: target.body.id,
        name: '档案目标更新',
        email: 'new-profile@example.com',
      }),
    );
    expect(managedUpdate.body.title).toBeUndefined();
    expect(managedUpdate.body.registrationStatus).toBeUndefined();

    const readManaged = await request(app.getHttpServer())
      .get(`/api/platform/employees/${target.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(readManaged.body.name).toBe('档案目标更新');

    await request(app.getHttpServer())
      .get(`/api/platform/employees/${outside.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .put(`/api/platform/employees/${outside.body.id}/profile`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ mobile: '13999999999' })
      .expect(404);
  });

  it('creates and reads status logs with per-subject profile scope authorization', async () => {
    await request(app.getHttpServer()).post('/api/platform/status-logs').expect(401);

    const adminToken = await loginAsAdmin();
    const suffix = Date.now().toString();
    const department = await createDepartment(adminToken, `SLD${suffix}`, '近况部门');
    const outsideDepartment = await createDepartment(adminToken, `SLX${suffix}`, '近况外部部门');
    const createRoleResponse = await createRoleWithPermissions(
      adminToken,
      `status-log-creator-${suffix}`,
      ['platform:employee:view', 'platform:status-log:create'],
      'department',
    );
    const viewOnlyRoleResponse = await createRoleWithPermissions(
      adminToken,
      `status-log-view-${suffix}`,
      ['platform:employee:view'],
      'department',
    );
    const creator = await createEmployee(adminToken, {
      departmentId: department.body.id,
      employeeNo: `SLC${suffix}`,
      account: `status-log-creator-${suffix}`,
      name: '近况记录人',
      roleIds: [createRoleResponse.body.id],
    });
    const viewOnly = await createEmployee(adminToken, {
      departmentId: department.body.id,
      employeeNo: `SLV${suffix}`,
      account: `status-log-view-${suffix}`,
      name: '近况只读',
      roleIds: [viewOnlyRoleResponse.body.id],
    });
    const insideA = await createEmployee(adminToken, {
      departmentId: department.body.id,
      employeeNo: `SLA${suffix}`,
      account: `status-log-a-${suffix}`,
      name: '近况对象 A',
    });
    const insideB = await createEmployee(adminToken, {
      departmentId: department.body.id,
      employeeNo: `SLB${suffix}`,
      account: `status-log-b-${suffix}`,
      name: '近况对象 B',
    });
    const outside = await createEmployee(adminToken, {
      departmentId: outsideDepartment.body.id,
      employeeNo: `SLO${suffix}`,
      account: `status-log-outside-${suffix}`,
      name: '近况外部对象',
    });
    const creatorToken = (await login(creator.body.account)).body.accessToken as string;
    const viewOnlyToken = (await login(viewOnly.body.account)).body.accessToken as string;
    memoryStore.employees.set(DEFAULT_ADMIN_USER_ID, {
      id: DEFAULT_ADMIN_USER_ID,
      enterpriseId: 'ent-default',
      employeeNo: `SLNV${suffix}`,
      account: `status-log-non-v4-${suffix}`,
      name: '非 v4 UUID 近况对象',
      departmentId: department.body.id,
      status: 'active',
      roleIds: [],
      mustChangePassword: false,
    });

    const created = await request(app.getHttpServer())
      .post('/api/platform/status-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectEmployeeIds: [insideA.body.id, insideB.body.id],
        content: '完成入职沟通',
      })
      .expect(201);
    expect(created.body).toHaveLength(2);
    expect(created.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectEmployeeId: insideA.body.id,
          authorEmployeeId: 'user-admin',
          content: '完成入职沟通',
        }),
        expect.objectContaining({
          subjectEmployeeId: insideB.body.id,
          authorEmployeeId: 'user-admin',
          content: '完成入职沟通',
        }),
      ]),
    );

    const readA = await request(app.getHttpServer())
      .get(`/api/platform/employees/${insideA.body.id}/status-logs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(readA.body).toEqual(
      expect.objectContaining({
        total: 1,
        items: [
          expect.objectContaining({
            subjectEmployeeId: insideA.body.id,
            content: '完成入职沟通',
          }),
        ],
      }),
    );

    const nonV4Created = await request(app.getHttpServer())
      .post('/api/platform/status-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectEmployeeIds: [DEFAULT_ADMIN_USER_ID],
        content: '合法非 v4 UUID 近况',
      })
      .expect(201);
    expect(nonV4Created.body).toEqual([
      expect.objectContaining({
        subjectEmployeeId: DEFAULT_ADMIN_USER_ID,
        content: '合法非 v4 UUID 近况',
      }),
    ]);
    const nonV4Read = await request(app.getHttpServer())
      .get(`/api/platform/employees/${DEFAULT_ADMIN_USER_ID}/status-logs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(nonV4Read.body).toEqual(
      expect.objectContaining({
        total: 1,
        items: [
          expect.objectContaining({
            subjectEmployeeId: DEFAULT_ADMIN_USER_ID,
            content: '合法非 v4 UUID 近况',
          }),
        ],
      }),
    );

    await request(app.getHttpServer())
      .post('/api/platform/status-logs')
      .set('Authorization', `Bearer ${viewOnlyToken}`)
      .send({
        subjectEmployeeIds: [insideA.body.id],
        content: '无权限写入',
      })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/platform/status-logs')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        subjectEmployeeIds: [insideA.body.id, outside.body.id],
        content: '包含越权对象',
      })
      .expect(404);

    const outsideAfterRejectedBatch = await request(app.getHttpServer())
      .get(`/api/platform/employees/${outside.body.id}/status-logs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(outsideAfterRejectedBatch.body.total).toBe(0);
    const insideAfterRejectedBatch = await request(app.getHttpServer())
      .get(`/api/platform/employees/${insideA.body.id}/status-logs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(insideAfterRejectedBatch.body.total).toBe(1);

    await request(app.getHttpServer())
      .get(`/api/platform/employees/${outside.body.id}/status-logs`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/platform/status-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectEmployeeIds: [insideA.body.id],
        content: '',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/platform/status-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectEmployeeIds: [insideA.body.id],
        content: '   ',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/platform/status-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectEmployeeIds: Array.from({ length: 101 }, () => insideA.body.id),
        content: '超出批量上限',
      })
      .expect(400);
  });

  it('writes audit logs for platform write operations', async () => {
    const token = await loginAsAdmin();
    const suffix = Date.now().toString();

    const departmentResponse = await request(app.getHttpServer())
      .post('/api/platform/departments')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Trace-Id', `trace-department-${suffix}`)
      .set('X-Forwarded-For', '198.51.100.20, 10.0.0.1')
      .set('User-Agent', 'memory-e2e-agent')
      .send({
        code: `AUDIT${suffix}`,
        name: '审计测试部门',
      })
      .expect(201);

    const roleResponse = await request(app.getHttpServer())
      .post('/api/platform/roles')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Trace-Id', `trace-role-${suffix}`)
      .send({
        enterpriseId: 'ent-default',
        code: `audit-role-${suffix}`,
        name: '审计测试角色',
        permissionCodes: ['platform:org:view'],
        dataScopes: [{ dataType: 'profile', scope: 'self' }],
      })
      .expect(201);

    const employeeResponse = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Trace-Id', `trace-employee-${suffix}`)
      .send({
        departmentId: departmentResponse.body.id,
        employeeNo: `AU${suffix}`,
        account: `audit-user-${suffix}`,
        name: '审计测试员工',
        initialPassword: 'Passw0rd1',
      })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/api/platform/employees/${employeeResponse.body.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Trace-Id', `trace-status-${suffix}`)
      .send({
        status: 'disabled',
      })
      .expect(200);

    await request(app.getHttpServer())
      .put(`/api/platform/employees/${employeeResponse.body.id}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Trace-Id', `trace-roles-${suffix}`)
      .send({
        roleIds: [],
      })
      .expect(200);

    expect(memoryStore.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorAccount: 'admin',
          action: 'platform.department.create',
          resourceId: departmentResponse.body.id,
          traceId: `trace-department-${suffix}`,
          ip: '198.51.100.20',
          userAgent: 'memory-e2e-agent',
          result: 'success',
        }),
        expect.objectContaining({
          actorAccount: 'admin',
          action: 'platform.role.create',
          resourceId: roleResponse.body.id,
          traceId: `trace-role-${suffix}`,
          result: 'success',
        }),
        expect.objectContaining({
          actorAccount: 'admin',
          action: 'platform.employee.create',
          resourceId: employeeResponse.body.id,
          traceId: `trace-employee-${suffix}`,
          result: 'success',
        }),
        expect.objectContaining({
          actorAccount: 'admin',
          action: 'platform.employee.status.update',
          resourceId: employeeResponse.body.id,
          traceId: `trace-status-${suffix}`,
          result: 'success',
        }),
        expect.objectContaining({
          actorAccount: 'admin',
          action: 'platform.employee.roles.assign',
          resourceId: employeeResponse.body.id,
          traceId: `trace-roles-${suffix}`,
          result: 'success',
        }),
      ]),
    );
  });

  describe('role management API', () => {
    it('creates, gets, updates, deletes, and audits roles', async () => {
      const token = await loginAsAdmin();
      const suffix = Date.now().toString();
      const createResponse = await request(app.getHttpServer())
        .post('/api/platform/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          enterpriseId: 'ent-default',
          code: `role-crud-${suffix}`,
          name: 'Role CRUD',
          permissionCodes: ['platform:org:view'],
          dataScopes: [
            { dataType: 'profile', scope: 'department' },
            { dataType: 'presence', scope: 'self' },
          ],
        })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/platform/roles/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((response) => {
          expect(response.body).toEqual(createResponse.body);
        });

      await request(app.getHttpServer())
        .patch(`/api/platform/roles/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Trace-Id', `trace-role-update-${suffix}`)
        .send({
          name: 'Role CRUD Updated',
          status: 'disabled',
          permissionCodes: ['platform:employee:view'],
          dataScopes: [{ dataType: 'report', scope: 'company' }],
        })
        .expect(200)
        .expect((response) => {
          expect(response.body).toEqual(
            expect.objectContaining({
              name: 'Role CRUD Updated',
              status: 'disabled',
              permissionCodes: ['platform:employee:view'],
              dataScopes: [{ dataType: 'report', scope: 'company' }],
            }),
          );
        });

      await request(app.getHttpServer())
        .delete(`/api/platform/roles/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Trace-Id', `trace-role-delete-${suffix}`)
        .expect(200)
        .expect({ success: true });

      await request(app.getHttpServer())
        .get(`/api/platform/roles/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(memoryStore.auditLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'platform.role.update',
            resourceId: createResponse.body.id,
            traceId: `trace-role-update-${suffix}`,
            metadata: {
              roleId: createResponse.body.id,
              name: 'Role CRUD Updated',
              status: 'disabled',
              permissionCodes: ['platform:employee:view'],
              dataScopes: [{ dataType: 'report', scope: 'company' }],
            },
          }),
          expect.objectContaining({
            action: 'platform.role.delete',
            resourceId: createResponse.body.id,
            traceId: `trace-role-delete-${suffix}`,
            metadata: {
              roleId: createResponse.body.id,
              code: `role-crud-${suffix}`,
            },
          }),
        ]),
      );
    });

    it('derives the role enterprise from the authenticated user', async () => {
      const token = await loginAsAdmin();
      const suffix = Date.now().toString();
      const response = await request(app.getHttpServer())
        .post('/api/platform/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          enterpriseId: 'ent-other',
          code: `role-tenant-${suffix}`,
          name: 'Role Tenant Boundary',
          permissionCodes: [],
          dataScopes: [],
        })
        .expect(201);

      expect(response.body.enterpriseId).toBe('ent-default');
    });

    it('hides cross-tenant roles and rejects cross-tenant role assignment', async () => {
      const token = await loginAsAdmin();
      const suffix = Date.now().toString();
      const foreignRole = await memoryStore.createRole({
        enterpriseId: 'ent-other',
        code: `foreign-role-${suffix}`,
        name: 'Foreign Role',
        permissionCodes: [],
        dataScopes: [],
      });
      const localRole = await memoryStore.createRole({
        enterpriseId: 'ent-default',
        code: `local-role-${suffix}`,
        name: 'Local Role',
        permissionCodes: [],
        dataScopes: [],
      });
      const createdForeignEmployee = await memoryStore.createEmployee({
        enterpriseId: 'ent-other',
        employeeNo: `FRE${suffix}`,
        account: `foreign-role-employee-${suffix}`,
        name: 'Foreign Role Employee',
        initialPassword: 'Scope1234',
      });
      const foreignEmployee = await memoryStore.setUserRoles(
        createdForeignEmployee.id,
        [foreignRole.id],
        'ent-other',
      );
      const target = await createEmployee(token, {
        employeeNo: `FRT${suffix}`,
        account: `foreign-role-target-${suffix}`,
        name: 'Foreign Role Target',
      });
      const assignmentAuditCount = memoryStore.auditLogs.filter(
        (audit) => audit.action === 'platform.employee.roles.assign' && audit.result === 'success',
      ).length;

      await request(app.getHttpServer())
        .get('/api/platform/roles')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((response) => {
          expect(response.body.items).not.toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: foreignRole.id,
              }),
            ]),
          );
        });

      for (const method of ['get', 'patch', 'delete'] as const) {
        const roleRequest =
          method === 'get'
            ? request(app.getHttpServer()).get(`/api/platform/roles/${foreignRole.id}`)
            : method === 'patch'
              ? request(app.getHttpServer()).patch(`/api/platform/roles/${foreignRole.id}`)
              : request(app.getHttpServer()).delete(`/api/platform/roles/${foreignRole.id}`);
        await roleRequest
          .set('Authorization', `Bearer ${token}`)
          .send(method === 'patch' ? { name: 'Changed Foreign Role' } : undefined)
          .expect(404);
      }

      await request(app.getHttpServer())
        .put(`/api/platform/employees/${target.body.id}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleIds: [foreignRole.id] })
        .expect(404);

      await expect(memoryStore.findEmployeeById(target.body.id)).resolves.toEqual(
        expect.objectContaining({
          roleIds: [],
        }),
      );

      await request(app.getHttpServer())
        .put(`/api/platform/employees/${createdForeignEmployee.id}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleIds: [localRole.id] })
        .expect(404);

      await request(app.getHttpServer())
        .put(`/api/platform/employees/${createdForeignEmployee.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'disabled' })
        .expect(404);

      await request(app.getHttpServer())
        .put(`/api/platform/employees/${createdForeignEmployee.id}/password`)
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'Changed123' })
        .expect(404);

      await expect(memoryStore.findEmployeeById(createdForeignEmployee.id)).resolves.toEqual(
        foreignEmployee,
      );
      const foreignIdentity = await memoryStore.findLocalIdentityByAccount(
        createdForeignEmployee.account,
      );
      if (!foreignIdentity) {
        throw new Error('Foreign identity should remain present');
      }
      expect(verifyPassword('Scope1234', foreignIdentity.passwordHash)).toBe(true);
      expect(verifyPassword('Changed123', foreignIdentity.passwordHash)).toBe(false);
      await expect(memoryStore.findRoleById(foreignRole.id)).resolves.toEqual(foreignRole);
      expect(
        memoryStore.auditLogs.filter(
          (audit) =>
            audit.action === 'platform.employee.roles.assign' && audit.result === 'success',
        ),
      ).toHaveLength(assignmentAuditCount);
      expect(memoryStore.auditLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'platform.role.update', result: 'failure' }),
          expect.objectContaining({ action: 'platform.role.delete', result: 'failure' }),
          expect.objectContaining({ action: 'platform.employee.roles.assign', result: 'failure' }),
          expect.objectContaining({ action: 'platform.employee.status.update', result: 'failure' }),
          expect.objectContaining({
            action: 'platform.employee.password.reset',
            result: 'failure',
          }),
        ]),
      );
    });

    it('rejects role injection through employee creation without role assignment permission', async () => {
      const suffix = Date.now().toString();
      const employeeCreatorRole = await memoryStore.createRole({
        enterpriseId: 'ent-default',
        code: `employee-creator-${suffix}`,
        name: 'Employee Creator',
        permissionCodes: ['platform:employee:create'],
        dataScopes: [],
      });
      const employeeCreator = await memoryStore.createEmployee({
        enterpriseId: 'ent-default',
        employeeNo: `EC${suffix}`,
        account: `employee-creator-${suffix}`,
        name: 'Employee Creator',
        initialPassword: 'Scope1234',
      });
      await memoryStore.setUserRoles(employeeCreator.id, [employeeCreatorRole.id], 'ent-default');
      const employeeCreatorToken = (await login(employeeCreator.account)).body
        .accessToken as string;

      await request(app.getHttpServer())
        .post('/api/platform/employees')
        .set('Authorization', `Bearer ${employeeCreatorToken}`)
        .send({
          employeeNo: `EI${suffix}`,
          account: `employee-injection-${suffix}`,
          name: 'Employee Injection',
          initialPassword: 'Scope1234',
          roleIds: ['role-admin'],
        })
        .expect(400);

      await expect(
        memoryStore.findLocalIdentityByAccount(`employee-injection-${suffix}`),
      ).resolves.toBeUndefined();

      const created = await request(app.getHttpServer())
        .post('/api/platform/employees')
        .set('Authorization', `Bearer ${employeeCreatorToken}`)
        .send({
          employeeNo: `ET${suffix}`,
          account: `employee-tenant-${suffix}`,
          name: 'Employee Tenant Boundary',
          initialPassword: 'Scope1234',
        })
        .expect(201);
      expect(created.body.enterpriseId).toBe('ent-default');

      const foreignDepartment = await memoryStore.createDepartment({
        enterpriseId: 'ent-other',
        code: `ETD${suffix}`,
        name: 'Foreign Department',
      });
      await request(app.getHttpServer())
        .post('/api/platform/employees')
        .set('Authorization', `Bearer ${employeeCreatorToken}`)
        .send({
          departmentId: foreignDepartment.id,
          employeeNo: `ED${suffix}`,
          account: `employee-department-${suffix}`,
          name: 'Employee Department Boundary',
          initialPassword: 'Scope1234',
        })
        .expect(404);
      await expect(
        memoryStore.findLocalIdentityByAccount(`employee-department-${suffix}`),
      ).resolves.toBeUndefined();
      expect(memoryStore.auditLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'platform.employee.create',
            result: 'failure',
            metadata: {
              reason: 'request_rejected',
            },
          }),
        ]),
      );
    });

    it('rejects protected, in-use, duplicate, and invalid role mutations', async () => {
      const token = await loginAsAdmin();
      const suffix = Date.now().toString();

      for (const method of ['patch', 'delete'] as const) {
        const roleRequest =
          method === 'patch'
            ? request(app.getHttpServer()).patch('/api/platform/roles/role-admin')
            : request(app.getHttpServer()).delete('/api/platform/roles/role-admin');
        const response = await roleRequest
          .set('Authorization', `Bearer ${token}`)
          .send(method === 'patch' ? { name: 'Changed Admin' } : undefined)
          .expect(409);
        expect(response.body.code).toBe('PLATFORM_ROLE_PROTECTED');
      }

      const role = await createRole(token, `role-in-use-${suffix}`, 'self');
      const employee = await createEmployee(token, {
        employeeNo: `RIU${suffix}`,
        account: `role-in-use-${suffix}`,
        name: 'Role In Use',
      });
      await request(app.getHttpServer())
        .put(`/api/platform/employees/${employee.body.id}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleIds: [role.body.id] })
        .expect(200);
      const inUseResponse = await request(app.getHttpServer())
        .delete(`/api/platform/roles/${role.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409);
      expect(inUseResponse.body.code).toBe('PLATFORM_ROLE_IN_USE');

      await request(app.getHttpServer())
        .post('/api/platform/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          enterpriseId: 'ent-default',
          code: `role-in-use-${suffix}`,
          name: 'Duplicate Role',
          permissionCodes: [],
          dataScopes: [],
        })
        .expect(409)
        .expect((response) => {
          expect(response.body.code).toBe('PLATFORM_DUPLICATE_RESOURCE');
        });

      await request(app.getHttpServer())
        .post('/api/platform/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          enterpriseId: 'ent-default',
          code: `role-duplicate-scope-${suffix}`,
          name: 'Duplicate Scope',
          permissionCodes: [],
          dataScopes: [
            { dataType: 'profile', scope: 'self' },
            { dataType: 'profile', scope: 'company' },
          ],
        })
        .expect(400);
      await request(app.getHttpServer())
        .patch(`/api/platform/roles/${role.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          dataScopes: [
            { dataType: 'presence', scope: 'self' },
            { dataType: 'presence', scope: 'company' },
          ],
        })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/platform/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          enterpriseId: 'ent-default',
          code: `role-invalid-scope-${suffix}`,
          name: 'Invalid Scope',
          permissionCodes: [],
          dataScopes: [{ dataType: 'unknown', scope: 'invalid' }],
        })
        .expect(400);
    });

    it('enforces role view/manage/assign permissions independently', async () => {
      const suffix = Date.now().toString();
      const assignRole = await memoryStore.createRole({
        enterpriseId: 'ent-default',
        code: `assign-role-${suffix}`,
        name: 'Assign Role',
        permissionCodes: ['platform:role:assign'],
        dataScopes: [],
      });
      const manageRole = await memoryStore.createRole({
        enterpriseId: 'ent-default',
        code: `manage-role-${suffix}`,
        name: 'Manage Role',
        permissionCodes: ['platform:role:manage'],
        dataScopes: [],
      });
      const assigner = await memoryStore.createEmployee({
        enterpriseId: 'ent-default',
        employeeNo: `RAS${suffix}`,
        account: `role-assign-${suffix}`,
        name: 'Role Assigner',
        initialPassword: 'Scope1234',
      });
      await memoryStore.setUserRoles(assigner.id, [assignRole.id], 'ent-default');
      const manager = await memoryStore.createEmployee({
        enterpriseId: 'ent-default',
        employeeNo: `RMG${suffix}`,
        account: `role-manage-${suffix}`,
        name: 'Role Manager',
        initialPassword: 'Scope1234',
      });
      await memoryStore.setUserRoles(manager.id, [manageRole.id], 'ent-default');
      const target = await memoryStore.createEmployee({
        enterpriseId: 'ent-default',
        employeeNo: `RTG${suffix}`,
        account: `role-target-${suffix}`,
        name: 'Role Target',
        initialPassword: 'Scope1234',
      });
      const assignToken = (await login(assigner.account)).body.accessToken as string;
      const manageToken = (await login(manager.account)).body.accessToken as string;

      await request(app.getHttpServer()).get('/api/platform/roles').expect(401);
      await request(app.getHttpServer())
        .get('/api/platform/roles')
        .set('Authorization', `Bearer ${manageToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .put(`/api/platform/employees/${target.id}/roles`)
        .set('Authorization', `Bearer ${assignToken}`)
        .send({ roleIds: [manageRole.id] })
        .expect(200);
      await request(app.getHttpServer())
        .put(`/api/platform/employees/${target.id}/roles`)
        .set('Authorization', `Bearer ${manageToken}`)
        .send({ roleIds: [] })
        .expect(403);
    });
  });

  it('returns normalized errors with trace id', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .set('X-Trace-Id', 'trace-e2e')
      .send({
        account: 'admin',
        password: 'wrong-password',
      })
      .expect(401);

    expect(response.headers['x-trace-id']).toBe('trace-e2e');
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'HTTP_401',
        message: '账号或密码错误',
        traceId: 'trace-e2e',
      }),
    );
  });

  describe('auth.login lockout', () => {
    it('locks after five wrong passwords and rejects the correct password while locked', async () => {
      const suffix = Date.now().toString();
      const account = `lockout-user-${suffix}`;
      await memoryStore.createEmployee({
        enterpriseId: 'ent-default',
        employeeNo: `LO${suffix}`,
        account,
        name: '锁定测试用户',
        initialPassword: 'Passw0rd1',
      });

      for (let attempt = 1; attempt <= 4; attempt += 1) {
        await request(app.getHttpServer())
          .post('/api/platform/auth/login')
          .send({
            account,
            password: 'wrong-password',
          })
          .expect(401)
          .expect((response) => {
            expect(response.body.message).toBe('账号或密码错误');
          });
      }

      await request(app.getHttpServer())
        .post('/api/platform/auth/login')
        .send({
          account,
          password: 'wrong-password',
        })
        .expect(401)
        .expect((response) => {
          expect(response.body.message).toContain('账号已被锁定');
        });

      await request(app.getHttpServer())
        .post('/api/platform/auth/login')
        .send({
          account,
          password: 'Passw0rd1',
        })
        .expect(401)
        .expect((response) => {
          expect(response.body.message).toContain('账号已被锁定');
        });

      const loginAudits = memoryStore.auditLogs.filter(
        (audit) => audit.action === 'auth.login' && audit.actorAccount === account,
      );
      expect(loginAudits.filter((audit) => audit.result === 'failure')).toHaveLength(6);
      expect(loginAudits.filter((audit) => audit.result === 'success')).toHaveLength(0);
      expect(loginAudits.at(-2)?.metadata).toEqual({
        reason: 'wrong_password',
        failedAttempts: 5,
        locked: true,
      });
      expect(loginAudits.at(-1)?.metadata).toEqual({
        reason: 'account_locked',
        remainingMinutes: 15,
      });
    });
  });

  describe('employee list scope filtering', () => {
    it('lets admin with company scope see employees from the enterprise', async () => {
      const token = await loginAsAdmin();
      const suffix = Date.now().toString();
      const employeeResponse = await createEmployee(token, {
        employeeNo: `SCA${suffix}`,
        account: `scope-admin-${suffix}`,
        name: 'Scope Admin Visible',
      });

      const response = await request(app.getHttpServer())
        .get('/api/platform/employees')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'user-admin' }),
          expect.objectContaining({ id: employeeResponse.body.id }),
        ]),
      );
    });

    it('limits department scoped employees to their own department', async () => {
      const adminToken = await loginAsAdmin();
      const suffix = Date.now().toString();
      const role = await createRole(adminToken, `scope-dept-${suffix}`, 'department');
      const department = await createDepartment(adminToken, `SCD${suffix}`, 'Scope Department');
      const sameDepartmentA = await createEmployee(adminToken, {
        departmentId: department.body.id,
        employeeNo: `SCDA${suffix}`,
        account: `scope-dept-a-${suffix}`,
        name: 'Scope Department A',
        roleIds: [role.body.id],
      });
      const sameDepartmentB = await createEmployee(adminToken, {
        departmentId: department.body.id,
        employeeNo: `SCDB${suffix}`,
        account: `scope-dept-b-${suffix}`,
        name: 'Scope Department B',
      });
      const otherDepartment = await createEmployee(adminToken, {
        employeeNo: `SCDC${suffix}`,
        account: `scope-dept-c-${suffix}`,
        name: 'Scope Department C',
      });
      const loginResponse = await login(`scope-dept-a-${suffix}`);

      const response = await request(app.getHttpServer())
        .get('/api/platform/employees')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .expect(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);

      expect(ids).toEqual(
        expect.arrayContaining([sameDepartmentA.body.id, sameDepartmentB.body.id]),
      );
      expect(ids).not.toContain(otherDepartment.body.id);
      expect(ids).not.toContain('user-admin');
    });

    it('limits self scoped employees to themselves', async () => {
      const adminToken = await loginAsAdmin();
      const suffix = Date.now().toString();
      const role = await createRole(adminToken, `scope-self-${suffix}`, 'self');
      const employee = await createEmployee(adminToken, {
        employeeNo: `SCS${suffix}`,
        account: `scope-self-${suffix}`,
        name: 'Scope Self',
        roleIds: [role.body.id],
      });
      const loginResponse = await login(`scope-self-${suffix}`);

      const response = await request(app.getHttpServer())
        .get('/api/platform/employees')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].id).toBe(employee.body.id);
    });

    it('degrades custom scoped employees to self', async () => {
      const adminToken = await loginAsAdmin();
      const suffix = Date.now().toString();
      const role = await createRole(adminToken, `scope-custom-${suffix}`, 'custom');
      const employee = await createEmployee(adminToken, {
        employeeNo: `SCC${suffix}`,
        account: `scope-custom-${suffix}`,
        name: 'Scope Custom',
        roleIds: [role.body.id],
      });
      const loginResponse = await login(`scope-custom-${suffix}`);

      const response = await request(app.getHttpServer())
        .get('/api/platform/employees')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].id).toBe(employee.body.id);
    });

    it('includes descendant departments for department_tree scoped employees', async () => {
      const adminToken = await loginAsAdmin();
      const suffix = Date.now().toString();
      const parentDepartment = await createDepartment(
        adminToken,
        `SCT${suffix}`,
        'Scope Tree Parent',
      );
      const childDepartment = await createDepartment(
        adminToken,
        `SCTC${suffix}`,
        'Scope Tree Child',
        parentDepartment.body.id,
      );
      const role = await createRole(adminToken, `scope-tree-${suffix}`, 'department_tree');
      const parentEmployee = await createEmployee(adminToken, {
        departmentId: parentDepartment.body.id,
        employeeNo: `SCTP${suffix}`,
        account: `scope-tree-parent-${suffix}`,
        name: 'Scope Tree Parent',
        roleIds: [role.body.id],
      });
      const childEmployee = await createEmployee(adminToken, {
        departmentId: childDepartment.body.id,
        employeeNo: `SCTC${suffix}`,
        account: `scope-tree-child-${suffix}`,
        name: 'Scope Tree Child',
      });
      const outsideEmployee = await createEmployee(adminToken, {
        employeeNo: `SCTO${suffix}`,
        account: `scope-tree-outside-${suffix}`,
        name: 'Scope Tree Outside',
      });
      const loginResponse = await login(`scope-tree-parent-${suffix}`);

      const response = await request(app.getHttpServer())
        .get('/api/platform/employees')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .expect(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);

      expect(ids).toEqual(expect.arrayContaining([parentEmployee.body.id, childEmployee.body.id]));
      expect(ids).not.toContain('user-admin');
      expect(ids).not.toContain(outsideEmployee.body.id);
    });

    // cross-enterprise isolation: covered by PostgreSQL E2E §4.14
  });

  describe('auth password change & reset', () => {
    it('changes the admin password and lets administrators reset employee passwords', async () => {
      const suffix = Date.now().toString();
      const adminLogin = await request(app.getHttpServer())
        .post('/api/platform/auth/login')
        .send({
          account: 'admin',
          password: 'admin123',
        })
        .expect(201);
      expect(adminLogin.body.user.mustChangePassword).toBe(true);

      await request(app.getHttpServer())
        .post('/api/platform/auth/change-password')
        .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
        .send({
          oldPassword: 'admin123',
          newPassword: 'Newpass1',
        })
        .expect(201)
        .expect((response) => {
          expect(response.body).toEqual({ success: true });
        });

      const currentUserResponse = await request(app.getHttpServer())
        .get('/api/platform/auth/me')
        .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
        .expect(200);
      expect(currentUserResponse.body.mustChangePassword).toBe(false);

      await request(app.getHttpServer())
        .post('/api/platform/auth/login')
        .send({
          account: 'admin',
          password: 'admin123',
        })
        .expect(401);

      const changedAdminLogin = await request(app.getHttpServer())
        .post('/api/platform/auth/login')
        .send({
          account: 'admin',
          password: 'Newpass1',
        })
        .expect(201);
      expect(changedAdminLogin.body.user.mustChangePassword).toBe(false);

      await request(app.getHttpServer())
        .post('/api/platform/auth/change-password')
        .set('Authorization', `Bearer ${changedAdminLogin.body.accessToken}`)
        .send({
          oldPassword: 'wrong',
          newPassword: 'Other1234',
        })
        .expect(401)
        .expect((response) => {
          expect(response.body.message).toBe('原密码错误');
        });
      await expect(memoryStore.findLocalIdentityByAccount('admin')).resolves.toEqual(
        expect.objectContaining({
          failedAttempts: 0,
        }),
      );

      const employeeResponse = await request(app.getHttpServer())
        .post('/api/platform/employees')
        .set('Authorization', `Bearer ${changedAdminLogin.body.accessToken}`)
        .send({
          employeeNo: `PW${suffix}`,
          account: `password-user-${suffix}`,
          name: '改密测试员工',
          initialPassword: 'Passw0rd1',
        })
        .expect(201);

      const employeeLogin = await request(app.getHttpServer())
        .post('/api/platform/auth/login')
        .send({
          account: `password-user-${suffix}`,
          password: 'Passw0rd1',
        })
        .expect(201);

      await request(app.getHttpServer())
        .put('/api/platform/employees/user-admin/password')
        .set('Authorization', `Bearer ${employeeLogin.body.accessToken}`)
        .send({
          newPassword: 'Manager123',
        })
        .expect(403);

      const resetResponse = await request(app.getHttpServer())
        .put(`/api/platform/employees/${employeeResponse.body.id}/password`)
        .set('Authorization', `Bearer ${changedAdminLogin.body.accessToken}`)
        .send({
          newPassword: 'Manager123',
        })
        .expect(200);
      expect(resetResponse.body.mustChangePassword).toBe(true);

      const resetEmployeeLogin = await request(app.getHttpServer())
        .post('/api/platform/auth/login')
        .send({
          account: `password-user-${suffix}`,
          password: 'Manager123',
        })
        .expect(201);
      expect(resetEmployeeLogin.body.user.mustChangePassword).toBe(true);
    });
  });

  async function loginAsAdmin(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account: 'admin',
        password: 'admin123',
      })
      .expect(201);

    return response.body.accessToken as string;
  }

  function createDepartment(token: string, code: string, name: string, parentId?: string) {
    return request(app.getHttpServer())
      .post('/api/platform/departments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        parentId,
        code,
        name,
      })
      .expect(201);
  }

  function createRole(
    token: string,
    code: string,
    dataScope: 'self' | 'department' | 'department_tree' | 'company' | 'custom',
  ) {
    return request(app.getHttpServer())
      .post('/api/platform/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        enterpriseId: 'ent-default',
        code,
        name: code,
        permissionCodes: ['platform:employee:view'],
        dataScopes: [{ dataType: 'profile', scope: dataScope }],
      })
      .expect(201);
  }

  function createRoleWithPermissions(
    token: string,
    code: string,
    permissionCodes: string[],
    dataScope: 'self' | 'department' | 'department_tree' | 'company' | 'custom' = 'self',
  ) {
    return request(app.getHttpServer())
      .post('/api/platform/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        enterpriseId: 'ent-default',
        code,
        name: code,
        permissionCodes,
        dataScopes: [{ dataType: 'profile', scope: dataScope }],
      })
      .expect(201);
  }

  async function createEmployee(
    token: string,
    input: {
      employeeNo: string;
      account: string;
      name: string;
      departmentId?: string;
      title?: string;
      mobile?: string;
      email?: string;
      roleIds?: string[];
    },
  ) {
    const response = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        departmentId: input.departmentId,
        employeeNo: input.employeeNo,
        account: input.account,
        name: input.name,
        title: input.title,
        mobile: input.mobile,
        email: input.email,
        initialPassword: 'Scope1234',
      })
      .expect(201);

    if (input.roleIds !== undefined) {
      await request(app.getHttpServer())
        .put(`/api/platform/employees/${response.body.id}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          roleIds: input.roleIds,
        })
        .expect(200);
    }

    return response;
  }

  function login(account: string) {
    return request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account,
        password: 'Scope1234',
      })
      .expect(201);
  }
});
