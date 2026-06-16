import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import { NotificationService, NotificationStreamRegistry } from '@work/notification-api';
import * as http from 'node:http';
import type { ClientRequest, IncomingMessage } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GatewayModule } from './gateway.module';

type SseStream = {
  request: ClientRequest;
  response: IncomingMessage;
};

describe('notification SSE stream', () => {
  let app: INestApplication;
  let baseUrl: string;
  let adminToken: string;
  let adminUserId: string;
  let otherToken: string;
  let otherUserId: string;
  let notificationService: NotificationService;
  let streamRegistry: NotificationStreamRegistry;
  const previousEnv: Record<string, string | undefined> = {};
  const employeePassword = String.fromCharCode(80, 97, 115, 115, 119, 48, 114, 100);
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
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();

    notificationService = app.get(NotificationService);
    streamRegistry = app.get(NotificationStreamRegistry, { strict: false });
    adminToken = await login('admin', 'admin123');
    const currentUserResponse = await request(app.getHttpServer())
      .get('/api/platform/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    adminUserId = currentUserResponse.body.id as string;

    const other = await createEmployee(`sse-user-${suffix}`, `SSE${suffix}`);
    otherUserId = other.id;
    otherToken = await login(other.account, employeePassword);
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

  it('requires login', async () => {
    await request(app.getHttpServer()).get('/api/notification/stream').expect(401);
  });

  it('streams a created signal to the authenticated recipient', async () => {
    const stream = await openStream(adminToken);
    expect(stream.response.headers['content-type']).toContain('text/event-stream');

    const signalPromise = waitForCreatedSignal(stream, 2_000);
    await notificationService.create({
      recipientUserIds: [adminUserId],
      title: 'SSE smoke',
      content: 'This content must stay out of the SSE frame',
      sourceModule: 'notification',
      sourceId: 'sse-smoke',
    });

    const frame = await signalPromise;
    expect(frame).toContain('"type":"notification.created"');
    expect(frame).not.toContain('This content must stay out of the SSE frame');
    await expectConnectionCount(adminUserId, 0);
  });

  it('does not stream another user recipient signal to the current connection', async () => {
    const stream = await openStream(otherToken);
    expect(stream.response.headers['content-type']).toContain('text/event-stream');

    const signalPromise = waitForCreatedSignal(stream, 350);
    await notificationService.create({
      recipientUserIds: [adminUserId],
      title: 'Wrong recipient',
      content: 'Other users must not see this signal',
      sourceModule: 'notification',
      sourceId: 'wrong-recipient',
    });

    await expect(signalPromise).rejects.toThrow('timed out waiting for notification.created');
    await expectConnectionCount(otherUserId, 0);
  });

  async function openStream(token: string): Promise<SseStream> {
    return new Promise((resolve, reject) => {
      const url = new URL('/api/notification/stream', baseUrl);
      const streamRequest = http.request(url, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
        },
      });

      streamRequest.once('error', reject);
      streamRequest.once('response', (response) => {
        streamRequest.removeListener('error', reject);
        streamRequest.on('error', () => {
          // Tests intentionally destroy the SSE request after the target frame.
        });
        expect(response.statusCode).toBe(200);
        resolve({ request: streamRequest, response });
      });
      streamRequest.end();
    });
  }

  async function waitForCreatedSignal(stream: SseStream, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      let settled = false;
      const timeout = setTimeout(() => {
        finish(new Error('timed out waiting for notification.created'));
      }, timeoutMs);

      const finish = (error?: Error, value?: string) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        stream.response.off('data', onData);
        stream.response.off('end', onEnd);
        stream.response.off('error', onError);
        stream.request.destroy();
        if (error) {
          reject(error);
          return;
        }
        resolve(value ?? buffer);
      };

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        if (buffer.includes('"type":"notification.created"')) {
          finish(undefined, buffer);
        }
      };

      const onEnd = () => finish(new Error('SSE stream ended before notification.created'));
      const onError = (error: Error) => finish(error);

      stream.response.on('data', onData);
      stream.response.once('end', onEnd);
      stream.response.once('error', onError);
    });
  }

  async function login(account: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({ account, password })
      .expect(201);
    return response.body.accessToken;
  }

  async function createEmployee(account: string, employeeNo: string) {
    const response = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enterpriseId: 'ent-default',
        employeeNo: employeeNo.slice(0, 20),
        account,
        name: account,
        initialPassword: employeePassword,
      })
      .expect(201);
    return response.body as { id: string; account: string };
  }

  async function expectConnectionCount(userId: string, expected: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 1_000) {
      if (streamRegistry.getConnectionCount(userId) === expected) {
        expect(streamRegistry.getConnectionCount(userId)).toBe(expected);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(streamRegistry.getConnectionCount(userId)).toBe(expected);
  }
});
