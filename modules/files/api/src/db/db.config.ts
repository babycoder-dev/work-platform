import process from 'node:process';

export interface FilesDatabaseConfig {
  databaseUrl: string;
  ssl: boolean;
  poolMax: number;
}

export function readFilesDatabaseConfig(): FilesDatabaseConfig {
  return {
    databaseUrl: process.env.DATABASE_URL ?? 'postgresql://work:work@localhost:5432/work_platform',
    ssl: process.env.DATABASE_SSL === 'true',
    poolMax: readPoolMax(),
  };
}

function readPoolMax(): number {
  const raw = process.env.FILES_DATABASE_POOL_MAX;
  if (raw === undefined || raw === '') {
    return 5;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('FILES_DATABASE_POOL_MAX must be a positive integer');
  }
  return parsed;
}
