/**
 * 一个可被 {@link SchedulerBootstrapService} 注册的调度 job 定义。
 *
 * - `key`：对应 `schedule_config.job_key`（{@link scheduleJobKeys}）。
 * - `defaultCron`：`schedule_config` 缺行时的兜底 cron（正常路径不应发生，seed 保证有行）。
 * - `run`：cron 触发时执行的 handler，由 {@link SchedulerBootstrapService.runSafely}
 *   整体 try/catch 包裹——job 抛错不得让调度器崩、不得影响其他 job（RFC §8.3 best-effort）。
 */
export interface ScheduledJobDefinition {
  key: string;
  defaultCron: string;
  run: () => Promise<void>;
}
