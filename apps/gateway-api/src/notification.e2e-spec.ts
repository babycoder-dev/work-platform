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

  beforeAll(async () => {
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

  async function login(account: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({ account, password })
      .expect(201);
    return response.body.accessToken;
  }
});
