export interface ScheduleConfigRecord {
  jobKey: string;
  cron: string;
  enabled: boolean;
  params: Record<string, unknown>;
  updatedAt: Date;
}
