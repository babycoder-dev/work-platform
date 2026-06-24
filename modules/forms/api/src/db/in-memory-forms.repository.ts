import { randomUUID } from 'node:crypto';
import type { UnitOfWork } from '@work/files-contract';
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

export class InMemoryFormsRepository implements FormsRepository {
  readonly definitions: FormDefinitionDto[] = [];
  readonly fields: FormFieldDto[] = [];
  readonly records: FormRecordDto[] = [];
  readonly values: FormRecordValueDto[] = [];
  private readonly activeUnitOfWorks = new WeakSet<UnitOfWork>();

  async withUnitOfWork<T>(uow: UnitOfWork, operation: () => Promise<T>): Promise<T> {
    const definitionSnapshot = this.definitions.map((definition) => ({ ...definition }));
    const fieldSnapshot = this.fields.map((field) => ({ ...field, options: copyJson(field.options) }));
    const recordSnapshot = this.records.map((record) => ({ ...record }));
    const valueSnapshot = this.values.map((value) => ({
      ...value,
      value: copyJson(value.value),
      displaySnapshot: copyJson(value.displaySnapshot),
    }));
    this.activeUnitOfWorks.add(uow);
    try {
      return await operation();
    } catch (error) {
      this.definitions.splice(0, this.definitions.length, ...definitionSnapshot);
      this.fields.splice(0, this.fields.length, ...fieldSnapshot);
      this.records.splice(0, this.records.length, ...recordSnapshot);
      this.values.splice(0, this.values.length, ...valueSnapshot);
      throw error;
    } finally {
      this.activeUnitOfWorks.delete(uow);
    }
  }

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

  async findDefinitionById(
    enterpriseId: string,
    id: string,
  ): Promise<FormDefinitionDto | undefined> {
    return this.definitions.find(
      (definition) => definition.enterpriseId === enterpriseId && definition.id === id,
    );
  }

  async findDefinitionBySlotKey(
    enterpriseId: string,
    slotKey: FormDefinitionDto['slotKey'],
  ): Promise<FormDefinitionDto | undefined> {
    return this.definitions.find(
      (definition) => definition.enterpriseId === enterpriseId && definition.slotKey === slotKey,
    );
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
    this.assertUnitOfWork(uow);
    let definition = await this.findDefinitionBySlotKey(input.enterpriseId, input.slotKey);
    if (!definition) {
      if (input.expectedRevision !== 0) {
        throw new Error('FORMS_DEFINITION_REVISION_CONFLICT');
      }
      definition = await this.createDefinition({
        enterpriseId: input.enterpriseId,
        slotKey: input.slotKey,
        ownerModule: input.ownerModule,
        revision: 0,
        createdBy: input.updatedBy,
      });
    }
    if (definition.revision !== input.expectedRevision) {
      throw new Error('FORMS_DEFINITION_REVISION_CONFLICT');
    }
    const updated: FormDefinitionDto = {
      ...definition,
      ownerModule: input.ownerModule,
      revision: definition.revision + 1,
      status: 'active',
      updatedAt: new Date().toISOString(),
    };
    const definitionIndex = this.definitions.findIndex(
      (candidate) => candidate.enterpriseId === input.enterpriseId && candidate.id === definition.id,
    );
    this.definitions[definitionIndex] = updated;
    for (let index = this.fields.length - 1; index >= 0; index -= 1) {
      const field = this.fields[index];
      if (field.enterpriseId === input.enterpriseId && field.definitionId === definition.id) {
        this.fields.splice(index, 1);
      }
    }
    for (const field of input.fields) {
      await this.createField({
        ...field,
        enterpriseId: input.enterpriseId,
        definitionId: definition.id,
      });
    }
    return {
      ...updated,
      fields: await this.listFieldsByDefinitionId(input.enterpriseId, definition.id),
    };
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

  async listFieldsByDefinitionId(
    enterpriseId: string,
    definitionId: string,
  ): Promise<FormFieldDto[]> {
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

  async findRecordBySubject(
    enterpriseId: string,
    slotKey: FormRecordDto['slotKey'],
    subjectType: string,
    subjectId: string,
  ): Promise<FormRecordDto | undefined> {
    const record = this.records.find(
      (candidate) =>
        candidate.enterpriseId === enterpriseId &&
        candidate.slotKey === slotKey &&
        candidate.subjectType === subjectType &&
        candidate.subjectId === subjectId,
    );
    if (!record) {
      return undefined;
    }
    return this.findRecordWithValues(enterpriseId, record.id);
  }

  async reserveRecord(input: ReserveRecordInput, uow: UnitOfWork): Promise<FormRecordDto> {
    this.assertUnitOfWork(uow);
    let record: FormRecordDto | undefined;
    if (input.cardinality === 'singleton') {
      record = this.records.find(
        (candidate) =>
          candidate.enterpriseId === input.record.enterpriseId &&
          candidate.slotKey === input.record.slotKey &&
          candidate.subjectType === input.record.subjectType &&
          candidate.subjectId === input.record.subjectId,
      );
    }
    if (!record) {
      return this.createRecord(input.record);
    }

    const existingRecord = record;
    const index = this.records.findIndex(
      (candidate) =>
        candidate.enterpriseId === existingRecord.enterpriseId && candidate.id === existingRecord.id,
    );
    record = {
      ...existingRecord,
      definitionId: input.record.definitionId,
      definitionRevision: input.record.definitionRevision,
      submittedBy: input.record.submittedBy,
      updatedAt: new Date().toISOString(),
    };
    this.records[index] = record;
    return record;
  }

  async replaceRecordValues(input: ReplaceRecordValuesInput, uow: UnitOfWork): Promise<FormRecordDto> {
    this.assertUnitOfWork(uow);
    const record = await this.findRecordById(input.enterpriseId, input.recordId);
    if (!record) {
      throw new Error('FORM_RECORD_NOT_FOUND');
    }
    for (let valueIndex = this.values.length - 1; valueIndex >= 0; valueIndex -= 1) {
      const value = this.values[valueIndex];
      if (value.enterpriseId === input.enterpriseId && value.recordId === input.recordId) {
        this.values.splice(valueIndex, 1);
      }
    }
    for (const value of input.values) {
      await this.createRecordValue({
        ...value,
        enterpriseId: input.enterpriseId,
        recordId: input.recordId,
      });
    }
    return {
      ...record,
      values: await this.listValuesByRecordId(input.enterpriseId, input.recordId),
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

  async listValuesByRecordId(
    enterpriseId: string,
    recordId: string,
  ): Promise<FormRecordValueDto[]> {
    return this.values
      .filter((value) => value.enterpriseId === enterpriseId && value.recordId === recordId)
      .sort((a, b) => a.sortOrderSnapshot - b.sortOrderSnapshot)
      .map((value) => ({
        ...value,
        value: copyJson(value.value),
        displaySnapshot: copyJson(value.displaySnapshot),
      }));
  }
  private assertUnitOfWork(uow: UnitOfWork): void {
    if (!this.activeUnitOfWorks.has(uow)) {
      throw new Error('FORMS_UNIT_OF_WORK_REQUIRED');
    }
  }
}

function copyJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}
