import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { readPlatformDatabaseConfig } from './db.config';

interface MigrationFile {
  name: string;
  path: string;
}

const modulePath = fileURLToPath(import.meta.url);
const migrationsDir = path.join(path.dirname(modulePath), 'migrations');

export async function runMigrations(): Promise<void> {
  const config = readPlatformDatabaseConfig();
  const client = new Client({
    connectionString: config.databaseUrl,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  try {
    await ensureMigrationTable(client);
    const appliedMigrations = await listAppliedMigrations(client);
    const migrationFiles = await listMigrationFiles();

    for (const migration of migrationFiles) {
      if (appliedMigrations.has(migration.name)) {
        continue;
      }

      const sql = await readFile(migration.path, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO platform.schema_migrations (name) VALUES ($1)', [migration.name]);
        await client.query('COMMIT');
        console.log(`Applied migration ${migration.name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

async function ensureMigrationTable(client: Client): Promise<void> {
  await client.query('CREATE SCHEMA IF NOT EXISTS platform');
  await client.query(`
    CREATE TABLE IF NOT EXISTS platform.schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function listAppliedMigrations(client: Client): Promise<Set<string>> {
  const result = await client.query<{ name: string }>('SELECT name FROM platform.schema_migrations');

  return new Set(result.rows.map((row) => row.name));
}

async function listMigrationFiles(): Promise<MigrationFile[]> {
  const filenames = await readdir(migrationsDir);

  return filenames
    .filter((filename) => filename.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right))
    .map((filename) => ({
      name: filename,
      path: path.join(migrationsDir, filename),
    }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  runMigrations().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
