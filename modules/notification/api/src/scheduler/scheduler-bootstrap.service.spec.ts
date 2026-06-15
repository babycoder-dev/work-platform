import { SchedulerRegistry } from '@nestjs/schedule';
import { scheduleJobKeys } from '@work/notification-contract';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ScheduleConfigRepository } from '../db/schedule-config.repository';
import type { HeartbeatJob } from './jobs/heartbeat.job';
import type {
  ReportReminderCompletedJob,
  ReportReminderDueJob,
} from './jobs/report-reminder.jobs';
import { SchedulerBootstrapService } from './scheduler-bootstrap.service';
import type { ScheduledJobDefinition } from './scheduled-job';

describe('SchedulerBootstrapService', () => {
  let registry: SchedulerRegistry;

  beforeEach(() => {
    registry = new SchedulerRegistry();
  });

  it('registers enabled jobs from schedule_config and skips disabled reserved jobs', async () => {
    const heartbeat = job(scheduleJobKeys.heartbeat, '*/5 * * * *');
    const service = new SchedulerBootstrapService(
      registry,
      repository({
        [scheduleJobKeys.heartbeat]: {
          cron: '0 * * * *',
          enabled: true,
        },
        [scheduleJobKeys.reportReminderDue]: {
          cron: '0 9 * * *',
          enabled: false,
        },
        [scheduleJobKeys.reportReminderCompleted]: {
          cron: '0 9 * * *',
          enabled: false,
        },
      }),
      heartbeat as unknown as HeartbeatJob,
      job(scheduleJobKeys.reportReminderDue, '0 9 * * *') as unknown as ReportReminderDueJob,
      job(scheduleJobKeys.reportReminderCompleted, '0 9 * * *') as unknown as ReportReminderCompletedJob,
    );

    await service.onModuleInit();

    expect(registry.doesExist('cron', scheduleJobKeys.heartbeat)).toBe(true);
    expect(registry.doesExist('cron', scheduleJobKeys.reportReminderDue)).toBe(false);
    expect(registry.doesExist('cron', scheduleJobKeys.reportReminderCompleted)).toBe(false);
    expect(registry.getCronJob(scheduleJobKeys.heartbeat).cronTime.source).toBe('0 * * * *');

    await service.onModuleDestroy();

    expect(registry.doesExist('cron', scheduleJobKeys.heartbeat)).toBe(false);
  });

  it('falls back to default cron when schedule_config is missing', async () => {
    const service = new SchedulerBootstrapService(
      registry,
      repository({}),
      job(scheduleJobKeys.heartbeat, '*/10 * * * *') as unknown as HeartbeatJob,
      job(scheduleJobKeys.reportReminderDue, '0 9 * * *') as unknown as ReportReminderDueJob,
      job(scheduleJobKeys.reportReminderCompleted, '0 9 * * *') as unknown as ReportReminderCompletedJob,
    );

    await service.onModuleInit();

    expect(registry.getCronJob(scheduleJobKeys.heartbeat).cronTime.source).toBe('*/10 * * * *');

    await service.onModuleDestroy();
  });

  it('swallows job handler errors when the cron fires', async () => {
    const service = new SchedulerBootstrapService(
      registry,
      repository({
        [scheduleJobKeys.heartbeat]: {
          cron: '0 * * * *',
          enabled: true,
        },
      }),
      job(scheduleJobKeys.heartbeat, '0 * * * *', async () => {
        throw new Error('boom');
      }) as unknown as HeartbeatJob,
      job(scheduleJobKeys.reportReminderDue, '0 9 * * *') as unknown as ReportReminderDueJob,
      job(scheduleJobKeys.reportReminderCompleted, '0 9 * * *') as unknown as ReportReminderCompletedJob,
    );

    await service.onModuleInit();

    await expect(registry.getCronJob(scheduleJobKeys.heartbeat).fireOnTick()).resolves.toBeUndefined();

    await service.onModuleDestroy();
  });

  it('fails module initialization when schedule_config cannot be read', async () => {
    const service = new SchedulerBootstrapService(
      registry,
      {
        ...repository({}),
        async findScheduleConfig() {
          throw new Error('database unavailable');
        },
      },
      job(scheduleJobKeys.heartbeat, '0 * * * *') as unknown as HeartbeatJob,
      job(scheduleJobKeys.reportReminderDue, '0 9 * * *') as unknown as ReportReminderDueJob,
      job(scheduleJobKeys.reportReminderCompleted, '0 9 * * *') as unknown as ReportReminderCompletedJob,
    );

    await expect(service.onModuleInit()).rejects.toThrow('database unavailable');
    expect(registry.doesExist('cron', scheduleJobKeys.heartbeat)).toBe(false);
  });

  it('cleans up registered jobs when later registration fails', async () => {
    const service = new SchedulerBootstrapService(
      registry,
      {
        ...repository({
          [scheduleJobKeys.heartbeat]: {
            cron: '0 * * * *',
            enabled: true,
          },
        }),
        async findScheduleConfig(jobKey) {
          if (jobKey === scheduleJobKeys.reportReminderDue) {
            throw new Error('database unavailable');
          }
          return repository({
            [scheduleJobKeys.heartbeat]: {
              cron: '0 * * * *',
              enabled: true,
            },
          }).findScheduleConfig(jobKey);
        },
      },
      job(scheduleJobKeys.heartbeat, '0 * * * *') as unknown as HeartbeatJob,
      job(scheduleJobKeys.reportReminderDue, '0 9 * * *') as unknown as ReportReminderDueJob,
      job(scheduleJobKeys.reportReminderCompleted, '0 9 * * *') as unknown as ReportReminderCompletedJob,
    );

    await expect(service.onModuleInit()).rejects.toThrow('database unavailable');
    expect(registry.doesExist('cron', scheduleJobKeys.heartbeat)).toBe(false);
  });
});

function job(
  key: string,
  defaultCron: string,
  run: () => Promise<void> = () => Promise.resolve(),
): { getDefinition: () => ScheduledJobDefinition } {
  return {
    getDefinition: () => ({
      key,
      defaultCron,
      run,
    }),
  };
}

function repository(
  configs: Record<string, { cron: string; enabled: boolean }>,
): ScheduleConfigRepository {
  return {
    async listScheduleConfigs() {
      return Object.entries(configs).map(([jobKey, config]) => ({
        jobKey,
        cron: config.cron,
        enabled: config.enabled,
        params: {},
        updatedAt: new Date('2026-06-15T00:00:00.000Z'),
      }));
    },
    async findScheduleConfig(jobKey: string) {
      const config = configs[jobKey];
      return config
        ? {
            jobKey,
            cron: config.cron,
            enabled: config.enabled,
            params: {},
            updatedAt: new Date('2026-06-15T00:00:00.000Z'),
          }
        : undefined;
    },
    async upsertScheduleConfig(jobKey, input) {
      return {
        jobKey,
        cron: input.cron ?? configs[jobKey]?.cron ?? '0 * * * *',
        enabled: input.enabled ?? configs[jobKey]?.enabled ?? true,
        params: input.params ?? {},
        updatedAt: new Date('2026-06-15T00:00:00.000Z'),
      };
    },
  };
}
