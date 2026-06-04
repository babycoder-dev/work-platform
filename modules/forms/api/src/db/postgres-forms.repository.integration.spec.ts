import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFormsDatabaseConfig } from './db.config';
import { runFormsMigrations } from './migrate';
import { PostgresFormsRepository } from './postgres-forms.repository';

const runPostgresIntegration = process.env.RUN_POSTGRES_INTEGRATION === 'true';

describe.skipIf(!runPostgresIntegration)('PostgresFormsRepository integration', () => {
  let pool: Pool;
  let repository: PostgresFormsRepository;
  let enterpriseOne: string;
  let enterpriseTwo: string;
  let userOne: string;
  let userTwo: string;

  beforeAll(async () => {
    const config = readFormsDatabaseConfig();
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    });
    await pool.query('DROP SCHEMA IF EXISTS forms CASCADE');
    await runFormsMigrations();
    await runFormsMigrations();
    repository = new PostgresFormsRepository(pool);
    enterpriseOne = randomUUID();
    enterpriseTwo = randomUUID();
    userOne = randomUUID();
    userTwo = randomUUID();
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('migrates from an empty schema, records migrations once, and isolates repository reads by enterpriseId', async () => {
    const migrations = await pool.query<{ name: string }>(
      'SELECT name FROM forms.schema_migrations ORDER BY name',
    );
    expect(migrations.rows).toEqual([{ name: '0000_init_forms.sql' }]);

    const definition = await repository.createDefinition({
      enterpriseId: enterpriseOne,
      slotKey: 'profile.employee',
      ownerModule: 'profile',
      createdBy: userOne,
    });
    await repository.createDefinition({
      enterpriseId: enterpriseTwo,
      slotKey: 'profile.employee',
      ownerModule: 'profile',
      createdBy: userTwo,
    });
    await repository.createField({
      enterpriseId: enterpriseOne,
      definitionId: definition.id,
      fieldKey: 'nickname',
      label: '昵称',
      fieldType: 'text',
      required: false,
      sortOrder: 1,
    });
    const record = await repository.createRecord({
      enterpriseId: enterpriseOne,
      definitionId: definition.id,
      slotKey: definition.slotKey,
      definitionRevision: definition.revision,
      subjectType: 'employee',
      subjectId: randomUUID(),
      submittedBy: userOne,
    });
    await repository.createRecordValue({
      enterpriseId: enterpriseOne,
      recordId: record.id,
      fieldKey: 'nickname',
      fieldLabelSnapshot: '昵称',
      fieldTypeSnapshot: 'text',
      value: 'A',
      sortOrderSnapshot: 1,
    });

    await expect(repository.findDefinitionById(enterpriseOne, definition.id)).resolves.toEqual(
      definition,
    );
    await expect(
      repository.findDefinitionById(enterpriseTwo, definition.id),
    ).resolves.toBeUndefined();
    await expect(repository.findRecordById(enterpriseTwo, record.id)).resolves.toBeUndefined();
    await expect(
      repository.listFieldsByDefinitionId(enterpriseTwo, definition.id),
    ).resolves.toEqual([]);
    await expect(repository.listValuesByRecordId(enterpriseTwo, record.id)).resolves.toEqual([]);
  });

  it('rejects cross-tenant child rows through composite foreign keys', async () => {
    const definition = await repository.createDefinition({
      enterpriseId: enterpriseOne,
      slotKey: 'report.daily',
      ownerModule: 'report',
      createdBy: userOne,
    });

    await expect(
      repository.createField({
        enterpriseId: enterpriseTwo,
        definitionId: definition.id,
        fieldKey: 'cross_tenant',
        label: '跨租户',
        fieldType: 'text',
        required: false,
        sortOrder: 1,
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
