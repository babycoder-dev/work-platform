import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PlatformModule } from './platform.module';
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
    const response = await request(app.getHttpServer()).get('/api/platform/departments').expect(401);

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
    const returnedModuleNames = (response.body.items as Array<{ moduleName: string }>).map((item) => item.moduleName);
    expect(returnedModuleNames).not.toContain('approval');
    expect(returnedModuleNames).not.toContain('report');
  });

  it('rejects users without required permissions', async () => {
    const adminToken = await loginAsAdmin();
    await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enterpriseId: 'ent-default',
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
        enterpriseId: 'ent-default',
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
        dataScope: 'self',
      })
      .expect(201);

    const employeeResponse = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Trace-Id', `trace-employee-${suffix}`)
      .send({
        enterpriseId: 'ent-default',
        departmentId: departmentResponse.body.id,
        employeeNo: `AU${suffix}`,
        account: `audit-user-${suffix}`,
        name: '审计测试员工',
        initialPassword: 'Passw0rd1',
        roleIds: [roleResponse.body.id],
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
          enterpriseId: 'ent-default',
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
});
