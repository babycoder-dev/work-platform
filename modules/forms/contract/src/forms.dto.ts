import type { FormSlotKey } from './events';
import type { FormFieldDto, FormFieldType } from './fields';

export type FormDefinitionStatus = 'active' | 'disabled';

export interface FormDefinitionDto {
  id: string;
  enterpriseId: string;
  slotKey: FormSlotKey;
  ownerModule: string;
  revision: number;
  status: FormDefinitionStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  fields?: FormFieldDto[];
}

export interface FormRecordDto {
  id: string;
  enterpriseId: string;
  definitionId: string;
  slotKey: FormSlotKey;
  definitionRevision: number;
  subjectType: string;
  subjectId: string;
  submittedBy: string;
  createdAt: string;
  updatedAt: string;
  values?: FormRecordValueDto[];
}

export interface FormRecordValueDto {
  id: string;
  enterpriseId: string;
  recordId: string;
  fieldKey: string;
  fieldLabelSnapshot: string;
  fieldTypeSnapshot: FormFieldType;
  value: unknown;
  displaySnapshot?: unknown;
  sortOrderSnapshot: number;
}

export interface CreateFormRecordInput {
  slotKey: FormSlotKey;
  subjectType: string;
  subjectId: string;
  definitionRevision: number;
  values: CreateFormRecordValueInput[];
}

export interface CreateFormRecordValueInput {
  fieldKey: string;
  value: unknown;
}

export interface FormActorContext {
  enterpriseId: string;
  userId: string;
  permissionCodes: string[];
}
