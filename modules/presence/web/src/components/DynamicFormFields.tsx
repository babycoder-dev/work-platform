import { Checkbox, Input, Select, Textarea } from '@work/ui';
import type { FormsDefinitionMirror, PresenceFormFieldType } from '../api/forms-mirror';

type PresenceFormField = FormsDefinitionMirror['fields'][number];

export function DynamicFormFields({
  fields,
  values,
  onChange,
}: {
  fields: PresenceFormField[];
  values: Record<string, unknown>;
  onChange: (fieldKey: string, value: unknown) => void;
}) {
  return (
    <div className="presence-register__dynamic-fields">
      {fields
        .filter((field) => field.status === 'active')
        .sort(sortFields)
        .map((field) => (
          <div className="presence-register__dynamic-field" key={field.fieldKey}>
            {renderField(field, values[field.fieldKey], (value) => onChange(field.fieldKey, value))}
            {field.description ? <p>{field.description}</p> : null}
          </div>
        ))}
    </div>
  );
}

export function hasRequiredUnsupportedPresenceFields(fields: PresenceFormField[]): boolean {
  return fields.some(
    (field) => field.status === 'active' && field.required && isUnsupportedField(field.fieldType),
  );
}

function renderField(
  field: PresenceFormField,
  value: unknown,
  onChange: (value: unknown) => void,
) {
  if (field.fieldType === 'textarea') {
    return (
      <Textarea
        label={field.label}
        onChange={(event) => onChange(event.target.value)}
        required={field.required}
        rows={4}
        value={stringValue(value)}
      />
    );
  }
  if (field.fieldType === 'number' || field.fieldType === 'date') {
    return (
      <Input
        label={field.label}
        onChange={(event) => onChange(event.target.value)}
        required={field.required}
        type={field.fieldType}
        value={stringValue(value)}
      />
    );
  }
  if (field.fieldType === 'single_select') {
    return (
      <Select
        label={field.label}
        onChange={(event) => onChange(event.target.value)}
        required={field.required}
        value={stringValue(value)}
      >
        <option value="">请选择</option>
        {(field.options ?? []).map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </Select>
    );
  }
  if (field.fieldType === 'multi_select') {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <div className="presence-register__checkbox-group">
        <span>{field.label}</span>
        {(field.options ?? []).map((option) => (
          <Checkbox
            checked={selected.includes(option.key)}
            key={option.key}
            label={option.label}
            onChange={() =>
              onChange(
                selected.includes(option.key)
                  ? selected.filter((item) => item !== option.key)
                  : [...selected, option.key],
              )
            }
          />
        ))}
      </div>
    );
  }
  if (isUnsupportedField(field.fieldType)) {
    return (
      <div className="presence-register__unsupported-field">
        <strong>{field.label}</strong>
        <p>暂不支持的字段类型</p>
      </div>
    );
  }
  return (
    <Input
      label={field.label}
      onChange={(event) => onChange(event.target.value)}
      required={field.required}
      value={stringValue(value)}
    />
  );
}

function isUnsupportedField(fieldType: PresenceFormFieldType): boolean {
  return fieldType === 'file' || fieldType === 'image' || fieldType === 'employee';
}

function stringValue(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function sortFields(left: PresenceFormField, right: PresenceFormField): number {
  return left.sortOrder - right.sortOrder || left.fieldKey.localeCompare(right.fieldKey);
}
