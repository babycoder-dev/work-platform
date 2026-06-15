import { Injectable } from '@nestjs/common';
import { scheduleJobKeys } from '@work/notification-contract';
import type { ScheduledJobDefinition } from '../scheduled-job';

/**
 * ① 日报截止前未交提醒（预留接线点）。
 *
 * seed `enabled=false`，故启动时不注册 cron。M10 接上在岗(M9) + 日报(M10) 生产数据后启用，
 * 并在此实现"在岗且未交日报→提醒本人"的业务逻辑。
 */
@Injectable()
export class ReportReminderDueJob {
  getDefinition(): ScheduledJobDefinition {
    return {
      key: scheduleJobKeys.reportReminderDue,
      // 预留(M10)：在岗(M9)且未交日报(M10)→提醒本人；依赖 M9 在岗名单 + M10 日报提交记录，本切片不存在生产数据。
      defaultCron: '0 9 * * *',
      run: async () => {
        // no-op：M10 在此实现接收人解析 + 通知生成。
      },
    };
  }
}

/**
 * ② 日报交齐提醒（预留接线点）。
 *
 * seed `enabled=false`，故启动时不注册 cron。M10 接上日报提交统计后启用，
 * 并在此实现"日报交齐→提醒部门负责人"的业务逻辑。
 */
@Injectable()
export class ReportReminderCompletedJob {
  getDefinition(): ScheduledJobDefinition {
    return {
      key: scheduleJobKeys.reportReminderCompleted,
      // 预留(M10)：日报交齐→提醒部门负责人；依赖 M10 日报提交统计，本切片不存在生产数据。
      defaultCron: '0 9 * * *',
      run: async () => {
        // no-op：M10 在此实现接收人解析 + 通知生成。
      },
    };
  }
}
