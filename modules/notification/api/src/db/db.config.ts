import process from 'node:process';

export interface NotificationDatabaseConfig {
  databaseUrl: string;
  ssl: boolean;
  poolMax: number;
}

export function readNotificationDatabaseConfig(): NotificationDatabaseConfig {
  return {
    databaseUrl: process.env.DATABASE_URL ?? 'postgresql://work:work@localhost:5432/work_platform',
    ssl: process.env.DATABASE_SSL === 'true',
    poolMax: readPoolMax(),
  };
}

function readPoolMax(): number {
  const raw = process.env.NOTIFICATION_DATABASE_POOL_MAX;
  if (raw === undefined || raw === '') {
    return 5;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('NOTIFICATION_DATABASE_POOL_MAX must be a positive integer');
  }
  return parsed;
}
