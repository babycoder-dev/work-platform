import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { NOTIFICATION_SCHEDULE_CONFIG_REPOSITORY } from '../db/schedule-config-repository.token';
import type { ScheduleConfigRepository } from '../db/schedule-config.repository';
import { HeartbeatJob } from './jobs/heartbeat.job';
import { ReportReminderCompletedJob, ReportReminderDueJob } from './jobs/report-reminder.jobs';
import type { ScheduledJobDefinition } from './scheduled-job';

/**
 * 调度引导服务：启动时从 `notification.schedule_config` 读 cron/enabled 动态注册 CronJob，
 * 停止时清理本服务注册的所有 job。
 *
 * 用 `SchedulerRegistry` + 动态 `CronJob`（而非 `@Cron('...')` 装饰器）是刻意的：
 * 装饰器把 cron 写死在编译期，无法满足 RFC §9.2「job 读配置而非硬编码 / 可配置截止时间」。
 *
 * 单实例调度边界（best-effort，预留）：`@nestjs/schedule` 是进程内调度，多副本部署时每个副本
 * 都会各自触发 cron（重复执行）。本期内网单实例部署足够（与 RFC §10 SSE 单实例直推一致）。
 * 多副本调度协调（分布式锁 / leader 选举 / DB advisory lock）【预留】——多副本时再补。
 */
@Injectable()
export class SchedulerBootstrapService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerBootstrapService.name);
  private readonly registeredKeys = new Set<string>();

  constructor(
    @Inject(SchedulerRegistry) private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(NOTIFICATION_SCHEDULE_CONFIG_REPOSITORY)
    private readonly scheduleConfigRepository: ScheduleConfigRepository,
    @Inject(HeartbeatJob) private readonly heartbeatJob: HeartbeatJob,
    @Inject(ReportReminderDueJob) private readonly reportReminderDueJob: ReportReminderDueJob,
    @Inject(ReportReminderCompletedJob)
    private readonly reportReminderCompletedJob: ReportReminderCompletedJob,
  ) {}

  async onModuleInit(): Promise<void> {
    const definitions = this.collectDefinitions();
    try {
      for (const definition of definitions) {
        await this.registerDefinition(definition);
      }
    } catch (error) {
      await this.onModuleDestroy();
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const key of this.registeredKeys) {
      try {
        const job = this.schedulerRegistry.getCronJob(key);
        job.stop();
        this.schedulerRegistry.deleteCronJob(key);
      } catch (error) {
        // key 已不存在 / registry 已清空，忽略即可——这里只关心「本服务注册过的 job 不残留」。
        this.logger.debug(`CronJob ${key} already absent during destroy: ${describeError(error)}`);
      }
    }
    this.registeredKeys.clear();
  }

  private async registerDefinition(definition: ScheduledJobDefinition): Promise<void> {
    const config = await this.scheduleConfigRepository.findScheduleConfig(definition.key);
    const cron = config?.cron ?? definition.defaultCron;
    const enabled = config?.enabled ?? true;
    if (config === undefined) {
      // 防御兜底：seed 保证有行；缺行说明迁移未跑或被误清，记 warn 但仍按 enabled=true 兜底注册。
      this.logger.warn(
        `schedule_config missing for job ${definition.key}; falling back to default cron ${definition.defaultCron}`,
      );
    }
    if (!enabled) {
      // enabled=false → 跳过注册（①② 预留 job 默认 disabled，启动时不挂 cron）。
      this.logger.debug(`schedule job ${definition.key} disabled, skip registration`);
      return;
    }

    const job = new CronJob(cron, () => void this.runSafely(definition));
    this.schedulerRegistry.addCronJob(definition.key, job);
    job.start();
    this.registeredKeys.add(definition.key);
    this.logger.log(`registered schedule job ${definition.key} with cron '${cron}'`);
  }

  private async runSafely(definition: ScheduledJobDefinition): Promise<void> {
    try {
      await definition.run();
    } catch (error) {
      // best-effort（RFC §8.3）：job 抛错不得让调度器崩、不得影响其他 job；仅记日志。
      this.logger.error(
        `schedule job ${definition.key} failed: ${describeError(error)}`,
      );
    }
  }

  private collectDefinitions(): ScheduledJobDefinition[] {
    return [
      this.heartbeatJob.getDefinition(),
      this.reportReminderDueJob.getDefinition(),
      this.reportReminderCompletedJob.getDefinition(),
    ];
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
