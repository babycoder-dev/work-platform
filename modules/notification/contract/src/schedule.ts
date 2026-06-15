export const scheduleJobKeys = {
  // 占位心跳 job：证明调度框架可用，零业务依赖（M7-3）。
  heartbeat: 'notification.heartbeat',
  // 预留(M10) ①：在岗且未交日报→提醒本人。依赖 M9 在岗 + M10 日报，M7-3 仅占 job key + 空 handler。
  reportReminderDue: 'report.reminder.due',
  // 预留(M10) ②：日报交齐→提醒部门负责人。依赖 M10 日报统计，M7-3 仅占 job key + 空 handler。
  reportReminderCompleted: 'report.reminder.completed',
  // 注意：④ profile.updated 是【事件驱动】(notificationTriggerKeys.profileUpdated，生产者 platform/M8)，
  // 不是调度 job，不在此列、不进 schedule_config。
} as const;

export interface ScheduleConfigDto {
  jobKey: string;
  cron: string;
  enabled: boolean;
  params: Record<string, unknown>;
  updatedAt: string; // ISO
}

// 供 M10 写路径复用；本切片无 HTTP 写入口。
export interface UpdateScheduleConfigInput {
  cron?: string;
  enabled?: boolean;
  params?: Record<string, unknown>;
}
