import process from 'node:process';

export interface FilesDatabaseConfig {
  databaseUrl: string;
  ssl: boolean;
}

export function readFilesDatabaseConfig(): FilesDatabaseConfig {
  return {
    databaseUrl: process.env.DATABASE_URL ?? 'postgresql://work:work@localhost:5432/work_platform',
    ssl: process.env.DATABASE_SSL === 'true',
  };
}
