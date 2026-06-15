import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type { UpdateScheduleConfigInput } from '@work/notification-contract';
import type { ScheduleConfigRecord } from './schema/schedule-config.schema';
import type { ScheduleConfigRepository } from './schedule-config.repository';

interface ScheduleConfigRow {
  job_key: string;
  cron: string;
  enabled: boolean;
  params: unknown;
  updated_at: Date;
}

@Injectable()
export class PostgresScheduleConfigRepository implements ScheduleConfigRepository {
  constructor(private readonly pool: Pool) {}

  async listScheduleConfigs(): Promise<ScheduleConfigRecord[]> {
    const result = await this.pool.query<ScheduleConfigRow>(`
      SELECT *
      FROM notification.schedule_config
      ORDER BY job_key ASC
    `);
    return result.rows.map(mapRow);
  }

  async findScheduleConfig(jobKey: string): Promise<ScheduleConfigRecord | undefined> {
    const result = await this.pool.query<ScheduleConfigRow>(
      `
        SELECT *
        FROM notification.schedule_config
        WHERE job_key = $1
      `,
      [jobKey],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async upsertScheduleConfig(
    jobKey: string,
    input: UpdateScheduleConfigInput,
  ): Promise<ScheduleConfigRecord> {
    const result = await this.pool.query<ScheduleConfigRow>(
      `
        INSERT INTO notification.schedule_config (job_key, cron, enabled, params, updated_at)
        VALUES (
          $1,
          COALESCE($2, '0 * * * *'),
          COALESCE($3, true),
          COALESCE($4::jsonb, '{}'::jsonb),
          now()
        )
        ON CONFLICT (job_key)
        DO UPDATE SET
          cron = COALESCE($2, notification.schedule_config.cron),
          enabled = COALESCE($3, notification.schedule_config.enabled),
          params = COALESCE($4::jsonb, notification.schedule_config.params),
          updated_at = now()
        RETURNING *
      `,
      [
        jobKey,
        input.cron ?? null,
        input.enabled ?? null,
        input.params === undefined ? null : JSON.stringify(input.params),
      ],
    );
    return mapRow(result.rows[0]);
  }
}

function mapRow(row: ScheduleConfigRow): ScheduleConfigRecord {
  const params =
    row.params && typeof row.params === 'object' && !Array.isArray(row.params)
      ? (row.params as Record<string, unknown>)
      : {};
  return {
    jobKey: row.job_key,
    cron: row.cron,
    enabled: row.enabled,
    params,
    updatedAt: row.updated_at,
  };
}
