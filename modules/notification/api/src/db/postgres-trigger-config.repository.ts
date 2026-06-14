import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type { TriggerConfigRecord } from './schema/trigger-config.schema';
import type { TriggerConfigRepository, UpsertTriggerConfigInput } from './trigger-config.repository';

interface TriggerConfigRow {
  trigger_key: string;
  enabled: boolean;
  default_recipients: unknown;
  updated_at: Date;
}

@Injectable()
export class PostgresTriggerConfigRepository implements TriggerConfigRepository {
  constructor(private readonly pool: Pool) {}

  async listTriggerConfigs(): Promise<TriggerConfigRecord[]> {
    const result = await this.pool.query<TriggerConfigRow>(`
      SELECT *
      FROM notification.trigger_config
      ORDER BY trigger_key ASC
    `);
    return result.rows.map(mapRow);
  }

  async findTriggerConfig(triggerKey: string): Promise<TriggerConfigRecord | undefined> {
    const result = await this.pool.query<TriggerConfigRow>(
      `
        SELECT *
        FROM notification.trigger_config
        WHERE trigger_key = $1
      `,
      [triggerKey],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async upsertTriggerConfig(
    triggerKey: string,
    input: UpsertTriggerConfigInput,
  ): Promise<TriggerConfigRecord> {
    const result = await this.pool.query<TriggerConfigRow>(
      `
        INSERT INTO notification.trigger_config (trigger_key, enabled, default_recipients, updated_at)
        VALUES (
          $1,
          COALESCE($2, true),
          COALESCE($3::jsonb, '[]'::jsonb),
          now()
        )
        ON CONFLICT (trigger_key)
        DO UPDATE SET
          enabled = COALESCE($2, notification.trigger_config.enabled),
          default_recipients = COALESCE($3::jsonb, notification.trigger_config.default_recipients),
          updated_at = now()
        RETURNING *
      `,
      [
        triggerKey,
        input.enabled ?? null,
        input.defaultRecipients === undefined ? null : JSON.stringify(input.defaultRecipients),
      ],
    );
    return mapRow(result.rows[0]);
  }
}

function mapRow(row: TriggerConfigRow): TriggerConfigRecord {
  const defaultRecipients = Array.isArray(row.default_recipients)
    ? row.default_recipients
    : [];
  return {
    triggerKey: row.trigger_key,
    enabled: row.enabled,
    defaultRecipients: defaultRecipients.map((recipient) => ({ ...(recipient as object) })) as TriggerConfigRecord['defaultRecipients'],
    updatedAt: row.updated_at,
  };
}
