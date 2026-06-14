import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readNotificationDatabaseConfig } from './db.config';
import { runNotificationMigrations } from './migrate';
import { PostgresNotificationRepository } from './postgres-notification.repository';
import { PostgresTriggerConfigRepository } from './postgres-trigger-config.repository';

const shouldRun = process.env.RUN_POSTGRES_INTEGRATION === 'true';

describe.skipIf(!shouldRun)('PostgresNotificationRepository', () => {
  let pool: Pool;
  let repository: PostgresNotificationRepository;
  let triggerConfigRepository: PostgresTriggerConfigRepository;
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
    recipientUserId = randomUUID();
    otherUserId = randomUUID();
  });

  afterAll(async () => {
    await pool?.end();
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

  async function notificationTableExists(): Promise<boolean> {
    return tableExists('notification.notification');
  }

  async function triggerConfigTableExists(): Promise<boolean> {
    return tableExists('notification.trigger_config');
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
