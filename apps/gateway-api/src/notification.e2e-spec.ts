import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import { NotificationService } from '@work/notification-api';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GatewayModule } from './gateway.module';

describe('notification API', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminUserId: string;
  let notificationService: NotificationService;
  const previousEnv: Record<string, string | undefined> = {};
  let suffix: string;

  beforeAll(async () => {
    suffix = Date.now().toString();
    for (const key of ['PLATFORM_REPOSITORY_DRIVER', 'NOTIFICATION_REPOSITORY_DRIVER']) {
      previousEnv[key] = process.env[key];
    }
    process.env.PLATFORM_REPOSITORY_DRIVER = 'memory';
    process.env.NOTIFICATION_REPOSITORY_DRIVER = 'memory';

    const moduleRef = await Test.createTestingModule({
      imports: [GatewayModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configurePlatformHttp(app, { globalPrefix: 'api' });
    await app.init();

    notificationService = app.get(NotificationService);
    adminToken = await login('admin', 'admin123');
    const currentUserResponse = await request(app.getHttpServer())
      .get('/api/platform/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    adminUserId = currentUserResponse.body.id as string;
  });

  afterAll(async () => {
    await app?.close();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('requires login and does not expose a public create endpoint', async () => {
    await request(app.getHttpServer()).get('/api/notification').expect(401);

    await request(app.getHttpServer())
      .post('/api/notification')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'bad', content: 'bad', recipientUserIds: [adminUserId] })
      .expect(404);
  });

  it('lists only current-user notifications and supports read state mutations', async () => {
    const created = await notificationService.create({
      recipientUserIds: [adminUserId, '00000000-0000-0000-0000-000000009999'],
      title: '审批提醒',
      content: '你有新的待处理事项',
      sourceModule: 'approval',
      sourceId: 'approval-1',
    });
    const ownNotification = created.items.find((item) => item.recipientUserId === adminUserId);
    const otherNotification = created.items.find((item) => item.recipientUserId !== adminUserId);
    expect(ownNotification).toBeDefined();
    expect(otherNotification).toBeDefined();
    if (!ownNotification || !otherNotification) {
      throw new Error('expected own and other notification records');
    }

    await request(app.getHttpServer())
      .get('/api/notification')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.total).toBe(1);
        expect(response.body.items).toEqual([
          expect.objectContaining({
            id: ownNotification.id,
            recipientUserId: adminUserId,
            channel: 'in_app',
            sourceModule: 'approval',
          }),
        ]);
      });

    await request(app.getHttpServer())
      .get('/api/notification/unread-count')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ count: 1 });
      });

    await request(app.getHttpServer())
      .put(`/api/notification/${otherNotification.id}/read`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .put(`/api/notification/${ownNotification.id}/read`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.readAt).toEqual(expect.any(String));
      });

    await request(app.getHttpServer())
      .get('/api/notification/unread-count')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ count: 0 });
      });

    await notificationService.create({
      recipientUserIds: [adminUserId],
      title: '系统消息',
      content: '新的通知',
    });

    await request(app.getHttpServer())
      .put('/api/notification/read-all')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ count: 1 });
      });
  });

  it('turns presence status changes into manager notifications through the shared event bus', async () => {
    const { managerToken, subjectToken } = await createPresenceTeam();
    const before = await unreadCount(managerToken);

    const created = await request(app.getHttpServer())
      .post('/api/presence/status-records')
      .set('Authorization', `Bearer ${subjectToken}`)
      .send({
        status: 'business_trip',
        startAt: '2026-06-07T01:00:00.000Z',
        endAt: '2026-06-07T09:00:00.000Z',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/notification')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              recipientUserId: expect.any(String),
              sourceModule: 'presence',
              sourceId: created.body.id,
              content: '有团队成员登记了出差状态，请查看在位看板',
            }),
          ]),
        );
      });
    await expect(unreadCount(managerToken)).resolves.toBe(before + 1);

    await request(app.getHttpServer())
      .delete(`/api/presence/status-records/${created.body.id}`)
      .set('Authorization', `Bearer ${subjectToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/notification')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              sourceModule: 'presence',
              sourceId: created.body.id,
              content: '有团队成员取消了出差状态，请查看在位看板',
            }),
          ]),
        );
      });
    await expect(unreadCount(managerToken)).resolves.toBe(before + 2);
  });

  it('protects trigger config writes and disables notification generation when configured off', async () => {
    const { managerToken, subjectToken, limitedToken } = await createPresenceTeam();
    const before = await unreadCount(managerToken);

    await request(app.getHttpServer())
      .put('/api/notification/trigger-config/presence.status.changed')
      .set('Authorization', `Bearer ${limitedToken}`)
      .send({ enabled: false })
      .expect(403);

    await request(app.getHttpServer())
      .put('/api/notification/trigger-config/presence.status.changed')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: false, defaultRecipients: [{ kind: 'department_manager' }] })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          triggerKey: 'presence.status.changed',
          enabled: false,
        });
      });

    await request(app.getHttpServer())
      .post('/api/presence/status-records')
      .set('Authorization', `Bearer ${subjectToken}`)
      .send({
        status: 'out',
        startAt: '2026-06-08T01:00:00.000Z',
        endAt: '2026-06-08T09:00:00.000Z',
      })
      .expect(201);

    await expect(unreadCount(managerToken)).resolves.toBe(before);

    await request(app.getHttpServer())
      .put('/api/notification/trigger-config/presence.status.changed')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true, defaultRecipients: [{ kind: 'department_manager' }] })
      .expect(200);
  });

  async function login(account: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({ account, password })
      .expect(201);
    return response.body.accessToken;
  }

  async function unreadCount(token: string): Promise<number> {
    const response = await request(app.getHttpServer())
      .get('/api/notification/unread-count')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return response.body.count as number;
  }

  async function createPresenceTeam() {
    const marker = `${suffix}-${Math.random().toString(36).slice(2, 8)}`;
    const manager = await createEmployee(`manager-${marker}`, `M${marker}`);
    const department = await request(app.getHttpServer())
      .post('/api/platform/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enterpriseId: 'ent-default',
        name: `Presence Dept ${marker}`,
        code: `D${marker}`.slice(0, 20),
        managerUserId: manager.id,
      })
      .expect(201);
    const subject = await createEmployee(`subject-${marker}`, `S${marker}`, department.body.id);
    const limited = await createEmployee(`limited-${marker}`, `L${marker}`);
    const roleResponse = await request(app.getHttpServer())
      .post('/api/platform/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enterpriseId: 'ent-default',
        code: `presence-create-${marker}`,
        name: `Presence create ${marker}`,
        permissionCodes: ['presence:status:create'],
        dataScopes: [
          { dataType: 'profile', scope: 'self' },
          { dataType: 'presence', scope: 'self' },
          { dataType: 'report', scope: 'self' },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/api/platform/employees/${subject.id}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleIds: [roleResponse.body.id] })
      .expect(200);

    return {
      managerToken: await login(manager.account, 'Passw0rd'),
      subjectToken: await login(subject.account, 'Passw0rd'),
      limitedToken: await login(limited.account, 'Passw0rd'),
    };
  }

  async function createEmployee(account: string, employeeNo: string, departmentId?: string) {
    const response = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enterpriseId: 'ent-default',
        employeeNo: employeeNo.slice(0, 20),
        account,
        name: account,
        departmentId,
        initialPassword: 'Passw0rd',
      })
      .expect(201);
    return response.body as { id: string; account: string };
  }
});
