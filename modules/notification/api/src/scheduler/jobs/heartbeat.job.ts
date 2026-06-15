import { Injectable, Logger } from '@nestjs/common';
import { scheduleJobKeys } from '@work/notification-contract';
import type { ScheduledJobDefinition } from '../scheduled-job';

/**
 * 占位心跳 job：证明调度框架真能按配置注册并运行，零业务依赖。
 *
 * 不读写任何业务表——仅更新进程内 `lastRunAt` / `runCount` 并打 debug 日志，
 * 暴露 {@link getStatus} 供测试断言（不开 HTTP 端点，§2.7）。
 */
@Injectable()
export class HeartbeatJob {
  private readonly logger = new Logger(HeartbeatJob.name);
  private lastRunAt: Date | null = null;
  private runCount = 0;

  getStatus(): { lastRunAt: Date | null; runCount: number } {
    return { lastRunAt: this.lastRunAt, runCount: this.runCount };
  }

  getDefinition(): ScheduledJobDefinition {
    return {
      key: scheduleJobKeys.heartbeat,
      defaultCron: '0 * * * *',
      run: async () => {
        this.lastRunAt = new Date();
        this.runCount += 1;
        this.logger.debug('notification heartbeat tick');
      },
    };
  }
}
