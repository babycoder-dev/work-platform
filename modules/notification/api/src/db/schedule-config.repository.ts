import type { UpdateScheduleConfigInput } from '@work/notification-contract';
import type { ScheduleConfigRecord } from './schema/schedule-config.schema';

export interface ScheduleConfigRepository {
  listScheduleConfigs(): Promise<ScheduleConfigRecord[]>;
  findScheduleConfig(jobKey: string): Promise<ScheduleConfigRecord | undefined>;
  upsertScheduleConfig(
    jobKey: string,
    input: UpdateScheduleConfigInput,
  ): Promise<ScheduleConfigRecord>;
}
