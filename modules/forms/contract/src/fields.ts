export const FORM_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'single_select',
  'multi_select',
  'file',
  'image',
  'employee',
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_FIELD_LIMITS = {
  maxFieldsPerDefinition: 100,
  fieldKeyMaxLength: 64,
  labelMaxLength: 128,
  descriptionMaxLength: 512,
  maxOptionsPerField: 100,
  optionKeyMaxLength: 64,
  optionLabelMaxLength: 128,
  textMaxLength: 512,
  textareaMaxLength: 10_000,
  maxMultiSelectValues: 100,
  maxFilesPerFileField: 10,
  maxEmployeesPerEmployeeField: 100,
  maxRecordValuesJsonBytes: 256 * 1024,
} as const;

export interface FormFieldOptionDto {
  key: string;
  label: string;
}

export type FormFieldStatus = 'active' | 'disabled';

export interface FormFieldDto {
  id: string;
  enterpriseId: string;
  definitionId: string;
  fieldKey: string;
  label: string;
  fieldType: FormFieldType;
  required: boolean;
  description?: string;
  sortOrder: number;
  options?: FormFieldOptionDto[];
  status: FormFieldStatus;
  createdAt: string;
  updatedAt: string;
}
