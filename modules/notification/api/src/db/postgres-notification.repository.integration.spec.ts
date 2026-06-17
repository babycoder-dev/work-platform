import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readNotificationDatabaseConfig } from './db.config';
import { runNotificationMigrations } from './migrate';
import { PostgresNotificationRepository } from './postgres-notification.repository';
import { PostgresScheduleConfigRepository } from './postgres-schedule-config.repository';
import { PostgresTriggerConfigRepository } from './postgres-trigger-config.repository';

const shouldRun = process.env.RUN_POSTGRES_INTEGRATION === 'true';

describe.skipIf(!shouldRun)('PostgresNotificationRepository', () => {
  let pool: Pool;
  let repository: PostgresNotificationRepository;
  let triggerConfigRepository: PostgresTriggerConfigRepository;
  let scheduleConfigRepository: PostgresScheduleConfigRepository;
  let recipientUserId: string;
  let otherUserId: string;

  beforeAll(async () => {
    await runNotificationMigrations();
    const config = readNotificationDatabaseConfig();
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      max: config.poolMax,
    });
    repository = new PostgresNotificationRepository(pool);
    triggerConfigRepository = new PostgresTriggerConfigRepository(pool);
    scheduleConfigRepository = new PostgresScheduleConfigRepository(pool);
    recipientUserId = randomUUID();
    otherUserId = randomUUID();
  });

  afterAll(async () => {
    if (pool) {
      await resetDefaultConfigs();
      await pool.end();
    }
  });

  beforeEach(async () => {
    await resetDefaultConfigs();
  });

  it('migrates idempotently and stores recipient-scoped read state', async () => {
    await runNotificationMigrations();

    const [own, other] = await repository.createMany([
      record(randomUUID(), recipientUserId, new Date('2026-06-01T00:00:00Z')),
      record(randomUUID(), otherUserId, new Date('2026-06-02T00:00:00Z')),
    ]);

    await expect(repository.countUnread(recipientUserId)).resolves.toBe(1);
    await expect(
      repository.listByRecipient(recipientUserId, { limit: 20, offset: 0 }),
    ).resolves.toMatchObject({
      total: 1,
      items: [{ id: own.id, recipientUserId }],
    });

    await expect(
      repository.markRead(recipientUserId, other.id, new Date('2026-06-03T00:00:00Z')),
    ).resolves.toBeUndefined();

    const read = await repository.markRead(
      recipientUserId,
      own.id,
      new Date('2026-06-03T00:00:00Z'),
    );
    expect(read?.readAt).toEqual(new Date('2026-06-03T00:00:00Z'));
    await expect(repository.countUnread(recipientUserId)).resolves.toBe(0);

    await expect(notificationTableExists()).resolves.toBe(true);
  });

  it('migrates trigger config idempotently and upserts default recipients', async () => {
    await runNotificationMigrations();

    await expect(
      triggerConfigRepository.findTriggerConfig('presence.status.changed'),
    ).resolves.toMatchObject({
      triggerKey: 'presence.status.changed',
      enabled: true,
      defaultRecipients: [{ kind: 'department_manager' }],
    });

    await expect(
      triggerConfigRepository.upsertTriggerConfig('presence.status.changed', {
        enabled: false,
        defaultRecipients: [{ kind: 'role', roleCode: 'hr' }],
      }),
    ).resolves.toMatchObject({
      triggerKey: 'presence.status.changed',
      enabled: false,
      defaultRecipients: [{ kind: 'role', roleCode: 'hr' }],
    });

    await expect(triggerConfigTableExists()).resolves.toBe(true);
  });

  it('migrates schedule config idempotently and upserts cron settings', async () => {
    await runNotificationMigrations();

    await expect(
      scheduleConfigRepository.findScheduleConfig('notification.heartbeat'),
    ).resolves.toMatchObject({
      jobKey: 'notification.heartbeat',
      cron: '0 * * * *',
      enabled: true,
      params: {},
    });
    await expect(
      scheduleConfigRepository.findScheduleConfig('report.reminder.due'),
    ).resolves.toMatchObject({
      jobKey: 'report.reminder.due',
      cron: '0 9 * * *',
      enabled: false,
      params: {},
    });

    await expect(
      scheduleConfigRepository.upsertScheduleConfig('notification.heartbeat', {
        cron: '*/15 * * * *',
        enabled: false,
        params: { threshold: 5 },
      }),
    ).resolves.toMatchObject({
      jobKey: 'notification.heartbeat',
      cron: '*/15 * * * *',
      enabled: false,
      params: { threshold: 5 },
    });

    await expect(
      scheduleConfigRepository.upsertScheduleConfig('notification.heartbeat', {
        enabled: true,
      }),
    ).resolves.toMatchObject({
      jobKey: 'notification.heartbeat',
      cron: '*/15 * * * *',
      enabled: true,
      params: { threshold: 5 },
    });

    await expect(scheduleConfigTableExists()).resolves.toBe(true);
  });

  async function notificationTableExists(): Promise<boolean> {
    return tableExists('notification.notification');
  }

  async function triggerConfigTableExists(): Promise<boolean> {
    return tableExists('notification.trigger_config');
  }

  async function scheduleConfigTableExists(): Promise<boolean> {
    return tableExists('notification.schedule_config');
  }

  async function tableExists(regclassName: string): Promise<boolean> {
    const client = new Client({
      connectionString: readNotificationDatabaseConfig().databaseUrl,
      ssl: readNotificationDatabaseConfig().ssl ? { rejectUnauthorized: false } : undefined,
    });
    await client.connect();
    try {
      const result = await client.query<{ exists: boolean }>(
        'SELECT to_regclass($1) IS NOT NULL AS exists',
        [regclassName],
      );
      return result.rows[0]?.exists === true;
    } finally {
      await client.end();
    }
  }

  async function resetDefaultConfigs(): Promise<void> {
    const triggerResult = await pool.query(
      `
        UPDATE notification.trigger_config
        SET enabled = true,
            default_recipients = '[{"kind":"department_manager"}]'::jsonb,
            updated_at = now()
        WHERE trigger_key = 'presence.status.changed'
      `,
    );
    expect(triggerResult.rowCount).toBe(1);

    const heartbeatResult = await pool.query(
      `
        UPDATE notification.schedule_config
        SET cron = '0 * * * *',
            enabled = true,
            params = '{}'::jsonb,
            updated_at = now()
        WHERE job_key = 'notification.heartbeat'
      `,
    );
    expect(heartbeatResult.rowCount).toBe(1);

    const reportResult = await pool.query(
      `
        UPDATE notification.schedule_config
        SET cron = '0 9 * * *',
            enabled = false,
            params = '{}'::jsonb,
            updated_at = now()
        WHERE job_key IN ('report.reminder.due', 'report.reminder.completed')
      `,
    );
    expect(reportResult.rowCount).toBe(2);
  }
});

function record(id: string, recipientUserId: string, createdAt: Date) {
  return {
    id,
    recipientUserId,
    title: `title-${id}`,
    content: `content-${id}`,
    channel: 'in_app' as const,
    createdAt,
  };
}
