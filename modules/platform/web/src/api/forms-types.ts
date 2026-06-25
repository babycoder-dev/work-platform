// Local mirror of the forms public contract. Platform web consumes forms through HTTP only;
// cross-module contract imports are intentionally avoided.
export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'single_select'
  | 'multi_select'
  | 'file'
  | 'image'
  | 'employee';

export interface FormFieldOption {
  key: string;
  label: string;
}

export interface FormField {
  fieldKey: string;
  label: string;
  fieldType: FormFieldType;
  required: boolean;
  description?: string;
  sortOrder: number;
  options?: FormFieldOption[];
  status: 'active' | 'disabled';
}

export interface FormDefinition {
  revision: number;
  status: 'active' | 'disabled';
  fields?: FormField[];
}

export interface FormRecordValue {
  fieldKey: string;
  fieldLabelSnapshot: string;
  fieldTypeSnapshot: FormFieldType;
  value: unknown;
  displaySnapshot?: unknown;
  sortOrderSnapshot: number;
}

export interface FormRecord {
  definitionRevision: number;
  values?: FormRecordValue[];
}

export interface UpsertProfileRecordInput {
  definitionRevision: number;
  values: Array<{ fieldKey: string; value: unknown }>;
}
