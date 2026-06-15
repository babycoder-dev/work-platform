import { Injectable } from '@nestjs/common';
import { scheduleJobKeys, type UpdateScheduleConfigInput } from '@work/notification-contract';
import type { ScheduleConfigRepository } from './schedule-config.repository';
import type { ScheduleConfigRecord } from './schema/schedule-config.schema';

// 与 0002_init_schedule_config.sql 的 seed 保持一致：进程内默认值与 Postgres seed 同源，
// 保证 driver=memory 时（in-memory e2e / 单测）启动也能读到同样的配置。
const DEFAULT_SCHEDULE_CONFIGS: ScheduleConfigRecord[] = [
  {
    jobKey: scheduleJobKeys.heartbeat,
    cron: '0 * * * *',
    enabled: true,
    params: {},
    updatedAt: new Date('2026-06-15T00:00:00.000Z'),
  },
  {
    jobKey: scheduleJobKeys.reportReminderDue,
    cron: '0 9 * * *',
    enabled: false,
    params: {},
    updatedAt: new Date('2026-06-15T00:00:00.000Z'),
  },
  {
    jobKey: scheduleJobKeys.reportReminderCompleted,
    cron: '0 9 * * *',
    enabled: false,
    params: {},
    updatedAt: new Date('2026-06-15T00:00:00.000Z'),
  },
];

@Injectable()
export class InMemoryScheduleConfigRepository implements ScheduleConfigRepository {
  private readonly records = new Map<string, ScheduleConfigRecord>(
    DEFAULT_SCHEDULE_CONFIGS.map((record) => [record.jobKey, cloneRecord(record)]),
  );

  async listScheduleConfigs(): Promise<ScheduleConfigRecord[]> {
    return Array.from(this.records.values()).map(cloneRecord);
  }

  async findScheduleConfig(jobKey: string): Promise<ScheduleConfigRecord | undefined> {
    const record = this.records.get(jobKey);
    return record ? cloneRecord(record) : undefined;
  }

  async upsertScheduleConfig(
    jobKey: string,
    input: UpdateScheduleConfigInput,
  ): Promise<ScheduleConfigRecord> {
    const existing = this.records.get(jobKey);
    const updated: ScheduleConfigRecord = {
      jobKey,
      cron: input.cron ?? existing?.cron ?? '0 * * * *',
      enabled: input.enabled ?? existing?.enabled ?? true,
      params: input.params ?? existing?.params ?? {},
      updatedAt: new Date(),
    };
    this.records.set(jobKey, cloneRecord(updated));
    return cloneRecord(updated);
  }
}

function cloneRecord(record: ScheduleConfigRecord): ScheduleConfigRecord {
  return {
    ...record,
    params: { ...record.params },
    updatedAt: new Date(record.updatedAt),
  };
}
