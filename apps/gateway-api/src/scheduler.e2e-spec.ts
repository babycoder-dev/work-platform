import type { INestApplication } from '@nestjs/common';
import { configurePlatformHttp } from '@work/nest-common';
import { HeartbeatJob, SchedulerRegistry } from '@work/notification-api';
import { scheduleJobKeys } from '@work/notification-contract';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GatewayModule } from './gateway.module';

describe('notification scheduler bootstrap', () => {
  let app: INestApplication;
  let registry: SchedulerRegistry;
  let heartbeatJob: HeartbeatJob;
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

    registry = app.get(SchedulerRegistry);
    heartbeatJob = app.get(HeartbeatJob);
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

  it('registers heartbeat from schedule_config and skips disabled report placeholders', async () => {
    expect(registry.doesExist('cron', scheduleJobKeys.heartbeat)).toBe(true);
    expect(registry.getCronJob(scheduleJobKeys.heartbeat).cronTime.source).toBe('0 * * * *');
    expect(registry.doesExist('cron', scheduleJobKeys.reportReminderDue)).toBe(false);
    expect(registry.doesExist('cron', scheduleJobKeys.reportReminderCompleted)).toBe(false);

    const before = heartbeatJob.getStatus();
    await heartbeatJob.getDefinition().run();
    const after = heartbeatJob.getStatus();

    expect(after.runCount).toBe(before.runCount + 1);
    expect(after.lastRunAt).toBeInstanceOf(Date);
  });
});
