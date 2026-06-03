import type {
  FormDefinitionDto,
  FormDefinitionStatus,
  FormFieldDto,
  FormFieldOptionDto,
  FormFieldStatus,
  FormFieldType,
  FormRecordDto,
  FormRecordValueDto,
  FormSlotKey,
} from '@work/forms-contract';

export interface CreateFormDefinitionRecordInput {
  id?: string;
  enterpriseId: string;
  slotKey: FormSlotKey;
  ownerModule: string;
  revision?: number;
  status?: FormDefinitionStatus;
  createdBy: string;
}

export interface CreateFormFieldRecordInput {
  id?: string;
  enterpriseId: string;
  definitionId: string;
  fieldKey: string;
  label: string;
  fieldType: FormFieldType;
  required: boolean;
  description?: string;
  sortOrder: number;
  options?: FormFieldOptionDto[];
  status?: FormFieldStatus;
}

export interface CreateFormRecordRecordInput {
  id?: string;
  enterpriseId: string;
  definitionId: string;
  slotKey: FormSlotKey;
  definitionRevision: number;
  subjectType: string;
  subjectId: string;
  submittedBy: string;
}

export interface CreateFormRecordValueRecordInput {
  id?: string;
  enterpriseId: string;
  recordId: string;
  fieldKey: string;
  fieldLabelSnapshot: string;
  fieldTypeSnapshot: FormFieldType;
  value: unknown;
  displaySnapshot?: unknown;
  sortOrderSnapshot: number;
}

export interface FormsRepository {
  createDefinition(input: CreateFormDefinitionRecordInput): Promise<FormDefinitionDto>;
  findDefinitionById(enterpriseId: string, id: string): Promise<FormDefinitionDto | undefined>;
  findDefinitionBySlotKey(enterpriseId: string, slotKey: FormSlotKey): Promise<FormDefinitionDto | undefined>;
  createField(input: CreateFormFieldRecordInput): Promise<FormFieldDto>;
  listFieldsByDefinitionId(enterpriseId: string, definitionId: string): Promise<FormFieldDto[]>;
  createRecord(input: CreateFormRecordRecordInput): Promise<FormRecordDto>;
  findRecordById(enterpriseId: string, id: string): Promise<FormRecordDto | undefined>;
  createRecordValue(input: CreateFormRecordValueRecordInput): Promise<FormRecordValueDto>;
  listValuesByRecordId(enterpriseId: string, recordId: string): Promise<FormRecordValueDto[]>;
}
