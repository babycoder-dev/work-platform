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

    await expect(repository.findFileObjectById(enterpriseOne, fileObject.id)).resolves.toEqual(
      fileObject,
    );
    await expect(
      repository.findFileObjectById(enterpriseTwo, fileObject.id),
    ).resolves.toBeUndefined();
    await expect(repository.listFileReferences(enterpriseOne, fileObject.id)).resolves.toHaveLength(
      1,
    );
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

  it('enforces quota atomically and claims attach idempotently', async () => {
    const quotaEnterprise = randomUUID();
    const quotaUser = randomUUID();
    const fileObject = await repository.createStagedFileObjectWithQuota(
      {
        enterpriseId: quotaEnterprise,
        provider: 'temp-disk',
        storageKey: `${quotaEnterprise}/2026/06/${randomUUID()}`,
        originalName: 'quota.txt',
        mediaType: 'text/plain',
        sizeBytes: 5,
        sha256: 'c'.repeat(64),
        uploadedBy: quotaUser,
        stagedExpiresAt: '2026-06-05T00:00:00.000Z',
      },
      { tenantQuotaBytes: 8, userQuotaBytes: 8 },
    );

    await expect(
      Promise.all([
        repository.createStagedFileObjectWithQuota(
          {
            enterpriseId: quotaEnterprise,
            provider: 'temp-disk',
            storageKey: `${quotaEnterprise}/2026/06/${randomUUID()}`,
            originalName: 'quota-2.txt',
            mediaType: 'text/plain',
            sizeBytes: 5,
            sha256: 'd'.repeat(64),
            uploadedBy: quotaUser,
            stagedExpiresAt: '2026-06-05T00:00:00.000Z',
          },
          { tenantQuotaBytes: 8, userQuotaBytes: 8 },
        ),
        repository.createStagedFileObjectWithQuota(
          {
            enterpriseId: quotaEnterprise,
            provider: 'temp-disk',
            storageKey: `${quotaEnterprise}/2026/06/${randomUUID()}`,
            originalName: 'quota-3.txt',
            mediaType: 'text/plain',
            sizeBytes: 5,
            sha256: 'e'.repeat(64),
            uploadedBy: quotaUser,
            stagedExpiresAt: '2026-06-05T00:00:00.000Z',
          },
          { tenantQuotaBytes: 8, userQuotaBytes: 8 },
        ),
      ]),
    ).rejects.toThrow(/FILES_(TENANT|USER)_QUOTA_EXCEEDED/);

    const attached = await repository.withUnitOfWork((uow) =>
      repository.attachStagedFile(
        {
          enterpriseId: quotaEnterprise,
          fileId: fileObject.id,
          uploadedBy: quotaUser,
          ownerModule: 'forms',
          referenceType: 'form_record',
          referenceId: randomUUID(),
          attachedBy: quotaUser,
        },
        uow,
      ),
    );
    expect(attached.kind).toBe('attached');

    if (attached.kind !== 'attached') {
      throw new Error('expected attached');
    }
    await expect(
      repository.withUnitOfWork((uow) =>
        repository.attachStagedFile(
          {
            enterpriseId: quotaEnterprise,
            fileId: fileObject.id,
            uploadedBy: quotaUser,
            ownerModule: attached.reference.ownerModule,
            referenceType: attached.reference.referenceType,
            referenceId: attached.reference.referenceId,
            attachedBy: quotaUser,
          },
          uow,
        ),
      ),
    ).resolves.toEqual(expect.objectContaining({ kind: 'idempotent' }));
    await expect(
      repository.withUnitOfWork((uow) =>
        repository.attachStagedFile(
          {
            enterpriseId: quotaEnterprise,
            fileId: fileObject.id,
            uploadedBy: quotaUser,
            ownerModule: 'forms',
            referenceType: 'form_record',
            referenceId: randomUUID(),
            attachedBy: quotaUser,
          },
          uow,
        ),
      ),
    ).resolves.toEqual({ kind: 'already_referenced' });
  });

  it('claims expired staged files as deleting and converges deleted idempotently', async () => {
    const fileObject = await repository.createFileObject({
      enterpriseId: enterpriseOne,
      provider: 'temp-disk',
      storageKey: `${enterpriseOne}/2026/06/${randomUUID()}`,
      originalName: 'expired.txt',
      mediaType: 'text/plain',
      sizeBytes: 7,
      sha256: 'f'.repeat(64),
      uploadedBy: userOne,
      stagedExpiresAt: '2026-06-01T00:00:00.000Z',
    });

    const claimed = await repository.claimExpiredStagedFiles({
      now: '2026-06-04T00:00:00.000Z',
      limit: 10,
    });
    expect(claimed).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: fileObject.id, status: 'deleting' })]),
    );
    await expect(repository.sumStoredBytes(enterpriseOne, userOne)).resolves.toBeGreaterThanOrEqual(
      7,
    );
    await expect(
      repository.markFileDeleted(enterpriseOne, fileObject.id, '2026-06-04T00:00:00.000Z'),
    ).resolves.toEqual(expect.objectContaining({ id: fileObject.id, status: 'deleted' }));
  });

  it('rolls back attached state and references when the unit of work fails', async () => {
    const fileObject = await repository.createFileObject({
      enterpriseId: enterpriseOne,
      provider: 'temp-disk',
      storageKey: `${enterpriseOne}/2026/06/${randomUUID()}`,
      originalName: 'rollback.txt',
      mediaType: 'text/plain',
      sizeBytes: 5,
      sha256: '1'.repeat(64),
      uploadedBy: userOne,
      stagedExpiresAt: '2026-06-05T00:00:00.000Z',
    });

    await expect(
      repository.withUnitOfWork(async (uow) => {
        await repository.attachStagedFile(
          {
            enterpriseId: enterpriseOne,
            fileId: fileObject.id,
            uploadedBy: userOne,
            ownerModule: 'forms',
            referenceType: 'form_record',
            referenceId: randomUUID(),
            attachedBy: userOne,
          },
          uow,
        );
        throw new Error('forms record failed');
      }),
    ).rejects.toThrow('forms record failed');

    await expect(repository.findFileObjectById(enterpriseOne, fileObject.id)).resolves.toEqual(
      expect.objectContaining({ status: 'staged' }),
    );
    await expect(repository.listFileReferences(enterpriseOne, fileObject.id)).resolves.toEqual([]);
  });
});
