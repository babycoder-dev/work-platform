import { randomUUID } from 'node:crypto';
import type { FormDefinitionDto, FormFieldDto, FormRecordDto, FormRecordValueDto } from '@work/forms-contract';
import type {
  CreateFormDefinitionRecordInput,
  CreateFormFieldRecordInput,
  CreateFormRecordRecordInput,
  CreateFormRecordValueRecordInput,
  FormsRepository,
} from './forms.repository';

export class InMemoryFormsRepository implements FormsRepository {
  readonly definitions: FormDefinitionDto[] = [];
  readonly fields: FormFieldDto[] = [];
  readonly records: FormRecordDto[] = [];
  readonly values: FormRecordValueDto[] = [];

  async createDefinition(input: CreateFormDefinitionRecordInput): Promise<FormDefinitionDto> {
    const now = new Date().toISOString();
    const definition: FormDefinitionDto = {
      id: input.id ?? randomUUID(),
      enterpriseId: input.enterpriseId,
      slotKey: input.slotKey,
      ownerModule: input.ownerModule,
      revision: input.revision ?? 1,
      status: input.status ?? 'active',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.definitions.push(definition);
    return definition;
  }

  async findDefinitionById(enterpriseId: string, id: string): Promise<FormDefinitionDto | undefined> {
    return this.definitions.find((definition) => definition.enterpriseId === enterpriseId && definition.id === id);
  }

  async findDefinitionBySlotKey(enterpriseId: string, slotKey: string): Promise<FormDefinitionDto | undefined> {
    return this.definitions.find(
      (definition) => definition.enterpriseId === enterpriseId && definition.slotKey === slotKey,
    );
  }

  async createField(input: CreateFormFieldRecordInput): Promise<FormFieldDto> {
    if ((await this.findDefinitionById(input.enterpriseId, input.definitionId)) === undefined) {
      throw new Error('FORM_DEFINITION_NOT_FOUND');
    }

    const now = new Date().toISOString();
    const field: FormFieldDto = {
      id: input.id ?? randomUUID(),
      enterpriseId: input.enterpriseId,
      definitionId: input.definitionId,
      fieldKey: input.fieldKey,
      label: input.label,
      fieldType: input.fieldType,
      required: input.required,
      description: input.description,
      sortOrder: input.sortOrder,
      options: input.options,
      status: input.status ?? 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.fields.push(field);
    return field;
  }

  async listFieldsByDefinitionId(enterpriseId: string, definitionId: string): Promise<FormFieldDto[]> {
    return this.fields
      .filter((field) => field.enterpriseId === enterpriseId && field.definitionId === definitionId)
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  async createRecord(input: CreateFormRecordRecordInput): Promise<FormRecordDto> {
    if ((await this.findDefinitionById(input.enterpriseId, input.definitionId)) === undefined) {
      throw new Error('FORM_DEFINITION_NOT_FOUND');
    }

    const now = new Date().toISOString();
    const record: FormRecordDto = {
      id: input.id ?? randomUUID(),
      enterpriseId: input.enterpriseId,
      definitionId: input.definitionId,
      slotKey: input.slotKey,
      definitionRevision: input.definitionRevision,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      submittedBy: input.submittedBy,
      createdAt: now,
      updatedAt: now,
    };
    this.records.push(record);
    return record;
  }

  async findRecordById(enterpriseId: string, id: string): Promise<FormRecordDto | undefined> {
    return this.records.find((record) => record.enterpriseId === enterpriseId && record.id === id);
  }

  async createRecordValue(input: CreateFormRecordValueRecordInput): Promise<FormRecordValueDto> {
    if ((await this.findRecordById(input.enterpriseId, input.recordId)) === undefined) {
      throw new Error('FORM_RECORD_NOT_FOUND');
    }

    const value: FormRecordValueDto = {
      id: input.id ?? randomUUID(),
      enterpriseId: input.enterpriseId,
      recordId: input.recordId,
      fieldKey: input.fieldKey,
      fieldLabelSnapshot: input.fieldLabelSnapshot,
      fieldTypeSnapshot: input.fieldTypeSnapshot,
      value: input.value,
      displaySnapshot: input.displaySnapshot,
      sortOrderSnapshot: input.sortOrderSnapshot,
    };
    this.values.push(value);
    return value;
  }

  async listValuesByRecordId(enterpriseId: string, recordId: string): Promise<FormRecordValueDto[]> {
    return this.values
      .filter((value) => value.enterpriseId === enterpriseId && value.recordId === recordId)
      .sort((left, right) => left.sortOrderSnapshot - right.sortOrderSnapshot);
  }
}
