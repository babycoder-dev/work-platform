import { Pool } from 'pg';
import type { FormDefinitionDto, FormFieldDto, FormRecordDto, FormRecordValueDto } from '@work/forms-contract';
import type {
  CreateFormDefinitionRecordInput,
  CreateFormFieldRecordInput,
  CreateFormRecordRecordInput,
  CreateFormRecordValueRecordInput,
  FormsRepository,
} from './forms.repository';

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

  async findDefinitionById(enterpriseId: string, id: string): Promise<FormDefinitionDto | undefined> {
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

  async findDefinitionBySlotKey(enterpriseId: string, slotKey: string): Promise<FormDefinitionDto | undefined> {
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

  async createField(input: CreateFormFieldRecordInput): Promise<FormFieldDto> {
    const result = await this.pool.query<FormFieldRow>(
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

  async listFieldsByDefinitionId(enterpriseId: string, definitionId: string): Promise<FormFieldDto[]> {
    const result = await this.pool.query<FormFieldRow>(
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

  async createRecordValue(input: CreateFormRecordValueRecordInput): Promise<FormRecordValueDto> {
    const result = await this.pool.query<FormRecordValueRow>(
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

  async listValuesByRecordId(enterpriseId: string, recordId: string): Promise<FormRecordValueDto[]> {
    const result = await this.pool.query<FormRecordValueRow>(
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
