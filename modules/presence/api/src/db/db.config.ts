import process from 'node:process';

export interface PresenceDatabaseConfig {
  databaseUrl: string;
  ssl: boolean;
}

export function readPresenceDatabaseConfig(): PresenceDatabaseConfig {
  return {
    databaseUrl: process.env.DATABASE_URL ?? 'postgresql://work:work@localhost:5432/work_platform',
    ssl: process.env.DATABASE_SSL === 'true',
  };
}
