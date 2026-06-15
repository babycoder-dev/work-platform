import { describe, expect, it } from 'vitest';
import { InMemoryScheduleConfigRepository } from './in-memory-schedule-config.repository';

describe('InMemoryScheduleConfigRepository', () => {
  it('seeds, lists and finds schedule configs', async () => {
    const repository = new InMemoryScheduleConfigRepository();

    await expect(repository.listScheduleConfigs()).resolves.toEqual([
      expect.objectContaining({
        jobKey: 'notification.heartbeat',
        cron: '0 * * * *',
        enabled: true,
        params: {},
      }),
      expect.objectContaining({
        jobKey: 'report.reminder.due',
        cron: '0 9 * * *',
        enabled: false,
        params: {},
      }),
      expect.objectContaining({
        jobKey: 'report.reminder.completed',
        cron: '0 9 * * *',
        enabled: false,
        params: {},
      }),
    ]);

    await expect(repository.findScheduleConfig('missing.job')).resolves.toBeUndefined();
  });

  it('upserts new and existing configs with partial field semantics', async () => {
    const repository = new InMemoryScheduleConfigRepository();

    await expect(
      repository.upsertScheduleConfig('custom.job', { params: { threshold: 3 } }),
    ).resolves.toMatchObject({
      jobKey: 'custom.job',
      cron: '0 * * * *',
      enabled: true,
      params: { threshold: 3 },
    });

    await expect(
      repository.upsertScheduleConfig('custom.job', { cron: '*/5 * * * *', enabled: false }),
    ).resolves.toMatchObject({
      jobKey: 'custom.job',
      cron: '*/5 * * * *',
      enabled: false,
      params: { threshold: 3 },
    });
  });
});
