import { randomUUID } from 'node:crypto';
import { UNIT_OF_WORK_CONTEXT, type UnitOfWork } from '@work/files-contract';
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
    expect(migrations.rows).toEqual([
      { name: '0000_init_forms.sql' },
      { name: '0001_singleton_record_unique.sql' },
    ]);

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

  it('replaces definitions and saves singleton records inside an opaque unit of work', async () => {
    const enterpriseId = randomUUID();
    const userId = randomUUID();
    const slotKey = 'profile.employee';
    const subjectId = randomUUID();

    await withTestUnitOfWork(pool, async (uow) => {
      const definition = await repository.replaceDefinitionFields(
        {
          enterpriseId,
          slotKey,
          ownerModule: 'profile',
          expectedRevision: 0,
          updatedBy: userId,
          fields: [
            {
              fieldKey: 'nickname',
              label: '昵称',
              fieldType: 'text',
              required: true,
              sortOrder: 1,
              status: 'active',
            },
          ],
        },
        uow,
      );
      expect(definition.revision).toBe(1);
      expect(definition.fields?.map((field) => field.fieldKey)).toEqual(['nickname']);

      const first = await repository.saveRecordWithValues(
        {
          cardinality: 'singleton',
          record: {
            id: randomUUID(),
            enterpriseId,
            definitionId: definition.id,
            slotKey,
            definitionRevision: definition.revision,
            subjectType: 'employee',
            subjectId,
            submittedBy: userId,
          },
          values: [
            {
              fieldKey: 'nickname',
              fieldLabelSnapshot: '昵称',
              fieldTypeSnapshot: 'text',
              value: 'first',
              sortOrderSnapshot: 1,
            },
          ],
        },
        uow,
      );
      const second = await repository.saveRecordWithValues(
        {
          cardinality: 'singleton',
          record: {
            id: randomUUID(),
            enterpriseId,
            definitionId: definition.id,
            slotKey,
            definitionRevision: definition.revision,
            subjectType: 'employee',
            subjectId,
            submittedBy: userId,
          },
          values: [
            {
              fieldKey: 'nickname',
              fieldLabelSnapshot: '昵称',
              fieldTypeSnapshot: 'text',
              value: 'second',
              sortOrderSnapshot: 1,
            },
          ],
        },
        uow,
      );

      expect(second.id).toBe(first.id);
      expect(second.values).toEqual([
        expect.objectContaining({ fieldKey: 'nickname', value: 'second' }),
      ]);
    });

    const persisted = await repository.findDefinitionWithFields(enterpriseId, slotKey);
    expect(persisted?.revision).toBe(1);
    await expect(
      withTestUnitOfWork(pool, async (uow) =>
        repository.replaceDefinitionFields(
          {
            enterpriseId,
            slotKey,
            ownerModule: 'profile',
            expectedRevision: 0,
            updatedBy: userId,
            fields: [],
          },
          uow,
        ),
      ),
    ).rejects.toThrow('FORMS_DEFINITION_REVISION_CONFLICT');
  });

  it('enforces singleton record cardinality for concurrent first submissions', async () => {
    const enterpriseId = randomUUID();
    const userId = randomUUID();
    const subjectId = randomUUID();
    const definition = await repository.createDefinition({
      enterpriseId,
      slotKey: 'profile.employee',
      ownerModule: 'profile',
      createdBy: userId,
    });

    const records = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        withTestUnitOfWork(pool, async (uow) =>
          repository.saveRecordWithValues(
            {
              cardinality: 'singleton',
              record: {
                id: randomUUID(),
                enterpriseId,
                definitionId: definition.id,
                slotKey: 'profile.employee',
                definitionRevision: definition.revision,
                subjectType: 'employee',
                subjectId,
                submittedBy: userId,
              },
              values: [
                {
                  fieldKey: 'nickname',
                  fieldLabelSnapshot: '昵称',
                  fieldTypeSnapshot: 'text',
                  value: `value-${index}`,
                  sortOrderSnapshot: 1,
                },
              ],
            },
            uow,
          ),
        ),
      ),
    );

    expect(new Set(records.map((record) => record.id)).size).toBe(1);
    const count = await pool.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM forms.form_records
        WHERE enterprise_id = $1
          AND slot_key = 'profile.employee'
          AND subject_type = 'employee'
          AND subject_id = $2
      `,
      [enterpriseId, subjectId],
    );
    expect(count.rows[0]?.count).toBe('1');
    await expect(
      repository.findRecordBySubject(
        enterpriseId,
        'profile.employee',
        'employee',
        subjectId,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: records[0].id,
        values: expect.arrayContaining([
          expect.objectContaining({ fieldKey: 'nickname' }),
        ]),
      }),
    );
    await expect(
      repository.findRecordBySubject(
        enterpriseTwo,
        'profile.employee',
        'employee',
        subjectId,
      ),
    ).resolves.toBeUndefined();
  });
});

async function withTestUnitOfWork<T>(pool: Pool, operation: (uow: UnitOfWork) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation({ kind: 'unit-of-work', [UNIT_OF_WORK_CONTEXT]: client });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
