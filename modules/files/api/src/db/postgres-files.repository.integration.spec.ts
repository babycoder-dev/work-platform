import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFilesDatabaseConfig } from './db.config';
import { runFilesMigrations } from './migrate';
import { PostgresFilesRepository } from './postgres-files.repository';

const runPostgresIntegration = process.env.RUN_POSTGRES_INTEGRATION === 'true';

describe.skipIf(!runPostgresIntegration)('PostgresFilesRepository integration', () => {
  let pool: Pool;
  let repository: PostgresFilesRepository;
  let enterpriseOne: string;
  let enterpriseTwo: string;
  let userOne: string;

  beforeAll(async () => {
    const config = readFilesDatabaseConfig();
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    });
    await pool.query('DROP SCHEMA IF EXISTS files CASCADE');
    await runFilesMigrations();
    await runFilesMigrations();
    repository = new PostgresFilesRepository(pool);
    enterpriseOne = randomUUID();
    enterpriseTwo = randomUUID();
    userOne = randomUUID();
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('migrates from an empty schema, records migrations once, and isolates repository reads by enterpriseId', async () => {
    const migrations = await pool.query<{ name: string }>(
      'SELECT name FROM files.schema_migrations ORDER BY name',
    );
    expect(migrations.rows).toEqual([{ name: '0000_init_files.sql' }]);

    const fileObject = await repository.createFileObject({
      enterpriseId: enterpriseOne,
      provider: 'temp-disk',
      storageKey: `${enterpriseOne}/2026/06/${randomUUID()}`,
      originalName: 'avatar.png',
      mediaType: 'image/png',
      sizeBytes: 128,
      sha256: 'a'.repeat(64),
      uploadedBy: userOne,
      stagedExpiresAt: '2026-06-04T00:00:00.000Z',
    });
    await repository.createFileReference({
      enterpriseId: enterpriseOne,
      fileId: fileObject.id,
      ownerModule: 'forms',
      referenceType: 'form_record',
      referenceId: randomUUID(),
      attachedBy: userOne,
    });

    await expect(repository.findFileObjectById(enterpriseOne, fileObject.id)).resolves.toEqual(fileObject);
    await expect(repository.findFileObjectById(enterpriseTwo, fileObject.id)).resolves.toBeUndefined();
    await expect(repository.listFileReferences(enterpriseOne, fileObject.id)).resolves.toHaveLength(1);
    await expect(repository.listFileReferences(enterpriseTwo, fileObject.id)).resolves.toEqual([]);
  });

  it('rejects cross-tenant file references through composite foreign keys', async () => {
    const fileObject = await repository.createFileObject({
      enterpriseId: enterpriseOne,
      provider: 'temp-disk',
      storageKey: `${enterpriseOne}/2026/06/${randomUUID()}`,
      originalName: 'doc.txt',
      mediaType: 'text/plain',
      sizeBytes: 1,
      sha256: 'b'.repeat(64),
      uploadedBy: userOne,
      stagedExpiresAt: '2026-06-04T00:00:00.000Z',
    });

    await expect(
      repository.createFileReference({
        enterpriseId: enterpriseTwo,
        fileId: fileObject.id,
        ownerModule: 'forms',
        referenceType: 'form_record',
        referenceId: randomUUID(),
        attachedBy: userOne,
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
