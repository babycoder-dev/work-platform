import { Pool } from 'pg';
import { UNIT_OF_WORK_CONTEXT, type UnitOfWork } from '@work/files-contract';
import type {
  FormDefinitionDto,
  FormFieldDto,
  FormRecordDto,
  FormRecordValueDto,
} from '@work/forms-contract';
import type {
  CreateFormDefinitionRecordInput,
  CreateFormFieldRecordInput,
  CreateFormRecordRecordInput,
  CreateFormRecordValueRecordInput,
  FormsRepository,
  ReplaceRecordValuesInput,
  ReplaceDefinitionFieldsInput,
  ReserveRecordInput,
  SaveRecordInput,
} from './forms.repository';

type QueryExecutor = Pick<Pool, 'query'>;

interface FormDefinitionRow {
  id: string;
  enterprise_id: string;
  slot_key: FormDefinitionDto['slotKey'];
  owner_module: string;
  revision: number;
  status: FormDefinitionDto['status'];
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface FormFieldRow {
  id: string;
  enterprise_id: string;
  definition_id: string;
  field_key: string;
  label: string;
  field_type: FormFieldDto['fieldType'];
  required: boolean;
  description: string | null;
  sort_order: number;
  options: FormFieldDto['options'] | null;
  status: FormFieldDto['status'];
  created_at: Date;
  updated_at: Date;
}

interface FormRecordRow {
  id: string;
  enterprise_id: string;
  definition_id: string;
  slot_key: FormRecordDto['slotKey'];
  definition_revision: number;
  subject_type: string;
  subject_id: string;
  submitted_by: string;
  created_at: Date;
  updated_at: Date;
}

interface FormRecordValueRow {
  id: string;
  enterprise_id: string;
  record_id: string;
  field_key: string;
  field_label_snapshot: string;
  field_type_snapshot: FormRecordValueDto['fieldTypeSnapshot'];
  value: unknown;
  display_snapshot: unknown | null;
  sort_order_snapshot: number;
}

const FORM_DEFINITION_COLUMNS = `
  id,
  enterprise_id,
  slot_key,
  owner_module,
  revision,
  status,
  created_by,
  created_at,
  updated_at
`;

const FORM_FIELD_COLUMNS = `
  id,
  enterprise_id,
  definition_id,
  field_key,
  label,
  field_type,
  required,
  description,
  sort_order,
  options,
  status,
  created_at,
  updated_at
`;

const FORM_RECORD_COLUMNS = `
  id,
  enterprise_id,
  definition_id,
  slot_key,
  definition_revision,
  subject_type,
  subject_id,
  submitted_by,
  created_at,
  updated_at
`;

const FORM_RECORD_VALUE_COLUMNS = `
  id,
  enterprise_id,
  record_id,
  field_key,
  field_label_snapshot,
  field_type_snapshot,
  value,
  display_snapshot,
  sort_order_snapshot
`;

export class PostgresFormsRepository implements FormsRepository {
  constructor(private readonly pool: Pool) {}

  async withUnitOfWork<T>(uow: UnitOfWork, operation: () => Promise<T>): Promise<T> {
    if (!resolveExecutor(uow)) {
      throw new Error('FORMS_UNIT_OF_WORK_REQUIRED');
    }
    return operation();
  }

  async createDefinition(input: CreateFormDefinitionRecordInput): Promise<FormDefinitionDto> {
    const result = await this.pool.query<FormDefinitionRow>(
      `
        INSERT INTO forms.form_definitions (
          id,
          enterprise_id,
          slot_key,
          owner_module,
          revision,
          status,
          created_by
        )
        VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7)
        RETURNING ${FORM_DEFINITION_COLUMNS}
      `,
      [
        input.id ?? null,
        input.enterpriseId,
        input.slotKey,
        input.ownerModule,
        input.revision ?? 1,
        input.status ?? 'active',
        input.createdBy,
      ],
    );

    return mapDefinition(result.rows[0]);
  }

  async findDefinitionById(
    enterpriseId: string,
    id: string,
  ): Promise<FormDefinitionDto | undefined> {
    const result = await this.pool.query<FormDefinitionRow>(
      `
        SELECT ${FORM_DEFINITION_COLUMNS}
        FROM forms.form_definitions
        WHERE enterprise_id = $1 AND id = $2
      `,
      [enterpriseId, id],
    );
    return result.rows[0] ? mapDefinition(result.rows[0]) : undefined;
  }

  async findDefinitionBySlotKey(
    enterpriseId: string,
    slotKey: FormDefinitionDto['slotKey'],
  ): Promise<FormDefinitionDto | undefined> {
    const result = await this.pool.query<FormDefinitionRow>(
      `
        SELECT ${FORM_DEFINITION_COLUMNS}
        FROM forms.form_definitions
        WHERE enterprise_id = $1 AND slot_key = $2
      `,
      [enterpriseId, slotKey],
    );
    return result.rows[0] ? mapDefinition(result.rows[0]) : undefined;
  }

  async findDefinitionWithFields(
    enterpriseId: string,
    slotKey: FormDefinitionDto['slotKey'],
  ): Promise<FormDefinitionDto | undefined> {
    const definition = await this.findDefinitionBySlotKey(enterpriseId, slotKey);
    if (!definition) {
      return undefined;
    }
    return {
      ...definition,
      fields: await this.listFieldsByDefinitionId(enterpriseId, definition.id),
    };
  }

  async replaceDefinitionFields(
    input: ReplaceDefinitionFieldsInput,
    uow: UnitOfWork,
  ): Promise<FormDefinitionDto> {
    const executor = requireExecutor(uow);
    let definition = await this.findDefinitionBySlotKeyWithExecutor(
      executor,
      input.enterpriseId,
      input.slotKey,
    );
    let updatedDefinition: FormDefinitionDto;
    if (!definition) {
      if (input.expectedRevision !== 0) {
        throw new Error('FORMS_DEFINITION_REVISION_CONFLICT');
      }
      definition = await this.insertDefinition(executor, {
        enterpriseId: input.enterpriseId,
        slotKey: input.slotKey,
        ownerModule: input.ownerModule,
        revision: 1,
        createdBy: input.updatedBy,
      });
      updatedDefinition = definition;
    } else {
      const updated = await executor.query<FormDefinitionRow>(
        `
          UPDATE forms.form_definitions
          SET owner_module = $4,
              revision = revision + 1,
              status = 'active',
              updated_at = now()
          WHERE enterprise_id = $1 AND slot_key = $2 AND revision = $3
          RETURNING ${FORM_DEFINITION_COLUMNS}
        `,
        [input.enterpriseId, input.slotKey, input.expectedRevision, input.ownerModule],
      );
      if (!updated.rows[0]) {
        throw new Error('FORMS_DEFINITION_REVISION_CONFLICT');
      }
      updatedDefinition = mapDefinition(updated.rows[0]);
    }

    await executor.query(
      `
        DELETE FROM forms.form_fields
        WHERE enterprise_id = $1 AND definition_id = $2
      `,
      [input.enterpriseId, definition.id],
    );
    for (const field of input.fields) {
      await this.insertField(executor, {
        ...field,
        enterpriseId: input.enterpriseId,
        definitionId: definition.id,
      });
    }
    return {
      ...updatedDefinition,
      fields: await this.listFieldsByDefinitionIdWithExecutor(
        executor,
        input.enterpriseId,
        updatedDefinition.id,
      ),
    };
  }

  async createField(input: CreateFormFieldRecordInput): Promise<FormFieldDto> {
    return this.insertField(this.pool, input);
  }

  private async insertField(
    executor: QueryExecutor,
    input: CreateFormFieldRecordInput,
  ): Promise<FormFieldDto> {
    const result = await executor.query<FormFieldRow>(
      `
        INSERT INTO forms.form_fields (
          id,
          enterprise_id,
          definition_id,
          field_key,
          label,
          field_type,
          required,
          description,
          sort_order,
          options,
          status
        )
        VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
        RETURNING ${FORM_FIELD_COLUMNS}
      `,
      [
        input.id ?? null,
        input.enterpriseId,
        input.definitionId,
        input.fieldKey,
        input.label,
        input.fieldType,
        input.required,
        input.description ?? null,
        input.sortOrder,
        input.options === undefined ? null : JSON.stringify(input.options),
        input.status ?? 'active',
      ],
    );
    return mapField(result.rows[0]);
  }

  async listFieldsByDefinitionId(
    enterpriseId: string,
    definitionId: string,
  ): Promise<FormFieldDto[]> {
    return this.listFieldsByDefinitionIdWithExecutor(this.pool, enterpriseId, definitionId);
  }

  private async listFieldsByDefinitionIdWithExecutor(
    executor: QueryExecutor,
    enterpriseId: string,
    definitionId: string,
  ): Promise<FormFieldDto[]> {
    const result = await executor.query<FormFieldRow>(
      `
        SELECT ${FORM_FIELD_COLUMNS}
        FROM forms.form_fields
        WHERE enterprise_id = $1 AND definition_id = $2
        ORDER BY sort_order ASC, created_at ASC
      `,
      [enterpriseId, definitionId],
    );
    return result.rows.map(mapField);
  }

  async createRecord(input: CreateFormRecordRecordInput): Promise<FormRecordDto> {
    const result = await this.pool.query<FormRecordRow>(
      `
        INSERT INTO forms.form_records (
          id,
          enterprise_id,
          definition_id,
          slot_key,
          definition_revision,
          subject_type,
          subject_id,
          submitted_by
        )
        VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8)
        RETURNING ${FORM_RECORD_COLUMNS}
      `,
      [
        input.id ?? null,
        input.enterpriseId,
        input.definitionId,
        input.slotKey,
        input.definitionRevision,
        input.subjectType,
        input.subjectId,
        input.submittedBy,
      ],
    );
    return mapRecord(result.rows[0]);
  }

  async findRecordById(enterpriseId: string, id: string): Promise<FormRecordDto | undefined> {
    const result = await this.pool.query<FormRecordRow>(
      `
        SELECT ${FORM_RECORD_COLUMNS}
        FROM forms.form_records
        WHERE enterprise_id = $1 AND id = $2
      `,
      [enterpriseId, id],
    );
    return result.rows[0] ? mapRecord(result.rows[0]) : undefined;
  }

  async findRecordWithValues(enterpriseId: string, id: string): Promise<FormRecordDto | undefined> {
    const record = await this.findRecordById(enterpriseId, id);
    if (!record) {
      return undefined;
    }
    return {
      ...record,
      values: await this.listValuesByRecordId(enterpriseId, id),
    };
  }

  async reserveRecord(input: ReserveRecordInput, uow: UnitOfWork): Promise<FormRecordDto> {
    const executor = requireExecutor(uow);
    let record: FormRecordDto | undefined;
    if (input.cardinality === 'singleton') {
      record = await this.findExistingSingletonRecord(executor, input);
    }

    if (record) {
      return this.updateReservedRecord(executor, input, record.id);
    }
    if (input.cardinality === 'singleton') {
      return this.insertSingletonRecordOrUseExisting(executor, input);
    }
    return this.insertRecord(executor, input.record);
  }

  async replaceRecordValues(
    input: ReplaceRecordValuesInput,
    uow: UnitOfWork,
  ): Promise<FormRecordDto> {
    const executor = requireExecutor(uow);
    const record = await executor.query<FormRecordRow>(
      `
        SELECT ${FORM_RECORD_COLUMNS}
        FROM forms.form_records
        WHERE enterprise_id = $1 AND id = $2
        FOR UPDATE
      `,
      [input.enterpriseId, input.recordId],
    );
    if (!record.rows[0]) {
      throw new Error('FORM_RECORD_NOT_FOUND');
    }
    await executor.query(
      `
        DELETE FROM forms.form_record_values
        WHERE enterprise_id = $1 AND record_id = $2
      `,
      [input.enterpriseId, input.recordId],
    );

    for (const value of input.values) {
      await this.insertRecordValue(executor, {
        ...value,
        enterpriseId: input.enterpriseId,
        recordId: input.recordId,
      });
    }
    return {
      ...mapRecord(record.rows[0]),
      values: await this.listValuesByRecordIdWithExecutor(
        executor,
        input.enterpriseId,
        input.recordId,
      ),
    };
  }

  async saveRecordWithValues(input: SaveRecordInput, uow: UnitOfWork): Promise<FormRecordDto> {
    const record = await this.reserveRecord(
      { record: input.record, cardinality: input.cardinality },
      uow,
    );
    return this.replaceRecordValues(
      {
        enterpriseId: input.record.enterpriseId,
        recordId: record.id,
        values: input.values,
      },
      uow,
    );
  }

  private async insertSingletonRecordOrUseExisting(
    executor: QueryExecutor,
    input: ReserveRecordInput,
  ): Promise<FormRecordDto> {
    await executor.query('SAVEPOINT forms_singleton_insert');
    try {
      const record = await this.insertRecord(executor, input.record);
      await executor.query('RELEASE SAVEPOINT forms_singleton_insert');
      return record;
    } catch (error) {
      await executor.query('ROLLBACK TO SAVEPOINT forms_singleton_insert');
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const existing = await this.findExistingSingletonRecord(executor, input);
      if (!existing) {
        throw error;
      }
      return this.updateReservedRecord(executor, input, existing.id);
    }
  }

  private async findExistingSingletonRecord(
    executor: QueryExecutor,
    input: ReserveRecordInput,
  ): Promise<FormRecordDto | undefined> {
    const existing = await executor.query<FormRecordRow>(
      `
        SELECT ${FORM_RECORD_COLUMNS}
        FROM forms.form_records
        WHERE enterprise_id = $1
          AND slot_key = $2
          AND subject_type = $3
          AND subject_id = $4
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE
      `,
      [
        input.record.enterpriseId,
        input.record.slotKey,
        input.record.subjectType,
        input.record.subjectId,
      ],
    );
    return existing.rows[0] ? mapRecord(existing.rows[0]) : undefined;
  }

  private async updateReservedRecord(
    executor: QueryExecutor,
    input: ReserveRecordInput,
    recordId: string,
  ): Promise<FormRecordDto> {
    const updated = await executor.query<FormRecordRow>(
      `
        UPDATE forms.form_records
        SET definition_id = $3,
            definition_revision = $4,
            submitted_by = $5,
            updated_at = now()
        WHERE enterprise_id = $1 AND id = $2
        RETURNING ${FORM_RECORD_COLUMNS}
      `,
      [
        input.record.enterpriseId,
        recordId,
        input.record.definitionId,
        input.record.definitionRevision,
        input.record.submittedBy,
      ],
    );
    return mapRecord(updated.rows[0]);
  }

  async createRecordValue(input: CreateFormRecordValueRecordInput): Promise<FormRecordValueDto> {
    return this.insertRecordValue(this.pool, input);
  }

  private async insertRecordValue(
    executor: QueryExecutor,
    input: CreateFormRecordValueRecordInput,
  ): Promise<FormRecordValueDto> {
    const result = await executor.query<FormRecordValueRow>(
      `
        INSERT INTO forms.form_record_values (
          id,
          enterprise_id,
          record_id,
          field_key,
          field_label_snapshot,
          field_type_snapshot,
          value,
          display_snapshot,
          sort_order_snapshot
        )
        VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
        RETURNING ${FORM_RECORD_VALUE_COLUMNS}
      `,
      [
        input.id ?? null,
        input.enterpriseId,
        input.recordId,
        input.fieldKey,
        input.fieldLabelSnapshot,
        input.fieldTypeSnapshot,
        JSON.stringify(input.value),
        input.displaySnapshot === undefined ? null : JSON.stringify(input.displaySnapshot),
        input.sortOrderSnapshot,
      ],
    );
    return mapValue(result.rows[0]);
  }

  async listValuesByRecordId(
    enterpriseId: string,
    recordId: string,
  ): Promise<FormRecordValueDto[]> {
    return this.listValuesByRecordIdWithExecutor(this.pool, enterpriseId, recordId);
  }

  private async listValuesByRecordIdWithExecutor(
    executor: QueryExecutor,
    enterpriseId: string,
    recordId: string,
  ): Promise<FormRecordValueDto[]> {
    const result = await executor.query<FormRecordValueRow>(
      `
        SELECT ${FORM_RECORD_VALUE_COLUMNS}
        FROM forms.form_record_values
        WHERE enterprise_id = $1 AND record_id = $2
        ORDER BY sort_order_snapshot ASC
      `,
      [enterpriseId, recordId],
    );
    return result.rows.map(mapValue);
  }

  private async insertDefinition(
    executor: QueryExecutor,
    input: CreateFormDefinitionRecordInput,
  ): Promise<FormDefinitionDto> {
    const result = await executor.query<FormDefinitionRow>(
      `
        INSERT INTO forms.form_definitions (
          id,
          enterprise_id,
          slot_key,
          owner_module,
          revision,
          status,
          created_by
        )
        VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7)
        RETURNING ${FORM_DEFINITION_COLUMNS}
      `,
      [
        input.id ?? null,
        input.enterpriseId,
        input.slotKey,
        input.ownerModule,
        input.revision ?? 1,
        input.status ?? 'active',
        input.createdBy,
      ],
    );
    return mapDefinition(result.rows[0]);
  }

  private async findDefinitionBySlotKeyWithExecutor(
    executor: QueryExecutor,
    enterpriseId: string,
    slotKey: FormDefinitionDto['slotKey'],
  ): Promise<FormDefinitionDto | undefined> {
    const result = await executor.query<FormDefinitionRow>(
      `
        SELECT ${FORM_DEFINITION_COLUMNS}
        FROM forms.form_definitions
        WHERE enterprise_id = $1 AND slot_key = $2
      `,
      [enterpriseId, slotKey],
    );
    return result.rows[0] ? mapDefinition(result.rows[0]) : undefined;
  }

  private async insertRecord(
    executor: QueryExecutor,
    input: CreateFormRecordRecordInput,
  ): Promise<FormRecordDto> {
    const result = await executor.query<FormRecordRow>(
      `
        INSERT INTO forms.form_records (
          id,
          enterprise_id,
          definition_id,
          slot_key,
          definition_revision,
          subject_type,
          subject_id,
          submitted_by
        )
        VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8)
        RETURNING ${FORM_RECORD_COLUMNS}
      `,
      [
        input.id ?? null,
        input.enterpriseId,
        input.definitionId,
        input.slotKey,
        input.definitionRevision,
        input.subjectType,
        input.subjectId,
        input.submittedBy,
      ],
    );
    return mapRecord(result.rows[0]);
  }
}

function requireExecutor(uow: UnitOfWork): QueryExecutor {
  const executor = resolveExecutor(uow);
  if (!executor) {
    throw new Error('FORMS_UNIT_OF_WORK_REQUIRED');
  }
  return executor;
}

function resolveExecutor(uow: UnitOfWork): QueryExecutor | undefined {
  return uow[UNIT_OF_WORK_CONTEXT] as QueryExecutor | undefined;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function mapDefinition(row: FormDefinitionRow): FormDefinitionDto {
  return {
    id: row.id,
    enterpriseId: row.enterprise_id,
    slotKey: row.slot_key,
    ownerModule: row.owner_module,
    revision: row.revision,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapField(row: FormFieldRow): FormFieldDto {
  return {
    id: row.id,
    enterpriseId: row.enterprise_id,
    definitionId: row.definition_id,
    fieldKey: row.field_key,
    label: row.label,
    fieldType: row.field_type,
    required: row.required,
    description: row.description ?? undefined,
    sortOrder: row.sort_order,
    options: row.options ?? undefined,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapRecord(row: FormRecordRow): FormRecordDto {
  return {
    id: row.id,
    enterpriseId: row.enterprise_id,
    definitionId: row.definition_id,
    slotKey: row.slot_key,
    definitionRevision: row.definition_revision,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    submittedBy: row.submitted_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapValue(row: FormRecordValueRow): FormRecordValueDto {
  return {
    id: row.id,
    enterpriseId: row.enterprise_id,
    recordId: row.record_id,
    fieldKey: row.field_key,
    fieldLabelSnapshot: row.field_label_snapshot,
    fieldTypeSnapshot: row.field_type_snapshot,
    value: row.value,
    displaySnapshot: row.display_snapshot ?? undefined,
    sortOrderSnapshot: row.sort_order_snapshot,
  };
}
