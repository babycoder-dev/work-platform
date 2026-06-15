import { describe, expect, it } from 'vitest';
import { HeartbeatJob } from './heartbeat.job';
import { ReportReminderCompletedJob, ReportReminderDueJob } from './report-reminder.jobs';

describe('notification scheduler jobs', () => {
  it('updates heartbeat status when run directly', async () => {
    const job = new HeartbeatJob();
    const before = job.getStatus();

    await job.getDefinition().run();

    const after = job.getStatus();
    expect(before).toEqual({ lastRunAt: null, runCount: 0 });
    expect(after.runCount).toBe(1);
    expect(after.lastRunAt).toBeInstanceOf(Date);
  });

  it('keeps reserved report reminder handlers as safe no-ops', async () => {
    await expect(new ReportReminderDueJob().getDefinition().run()).resolves.toBeUndefined();
    await expect(new ReportReminderCompletedJob().getDefinition().run()).resolves.toBeUndefined();
  });
});
