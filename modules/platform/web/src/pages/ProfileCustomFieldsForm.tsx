import { useMemo, useState } from 'react';
import { Button, Checkbox, Input, Select, Textarea } from '@work/ui';
import type { FormDefinition, FormField, FormRecord, FormRecordValue } from '../api/forms-types';
import { getFormsApi } from '../runtime';

type FormValues = Record<string, unknown>;

export function ProfileCustomFieldsForm({
  employeeId,
  definition,
  record,
  onCancel,
  onSaved,
  onConflictReload,
}: {
  employeeId: string;
  definition: FormDefinition;
  record: FormRecord | null;
  onCancel: () => void;
  onSaved: (record: FormRecord) => void;
  onConflictReload: () => Promise<void>;
}) {
  const fields = useMemo(
    () => (definition.fields ?? []).filter((field) => field.status === 'active').sort(sortFields),
    [definition.fields],
  );
  const originalValueByKey = useMemo(() => {
    const map = new Map<string, FormRecordValue>();
    for (const value of record?.values ?? []) {
      map.set(value.fieldKey, value);
    }
    return map;
  }, [record]);
  const [values, setValues] = useState<FormValues>(() =>
    buildInitialValues(fields, originalValueByKey),
  );
  const [message, setMessage] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const validationMessage = validateRequired(fields, values);
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    setSubmitting(true);
    setMessage(undefined);
    try {
      const saved = await getFormsApi().upsertProfileRecord(employeeId, {
        definitionRevision: definition.revision,
        values: fields.map((field) => ({
          fieldKey: field.fieldKey,
          value: normalizeValue(
            field,
            values[field.fieldKey],
            originalValueByKey.get(field.fieldKey),
          ),
        })),
      });
      onSaved(saved);
    } catch (error) {
      setMessage(readError(error, '保存自定义字段失败'));
      if (readError(error, '').includes('定义')) {
        await onConflictReload();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (fields.length === 0) {
    return (
      <div className="employee-profile__form">
        <p className="employee-profile__muted">当前槽位还没有启用的自定义字段。</p>
        <div className="employee-profile__form-actions">
          <Button onClick={onCancel}>返回</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="employee-profile__form">
      {fields.map((field) => (
        <div className="employee-profile__field" key={field.fieldKey}>
          {renderField(field, values[field.fieldKey], (nextValue) =>
            setValues((current) => ({ ...current, [field.fieldKey]: nextValue })),
          )}
          {field.description ? <p className="employee-profile__hint">{field.description}</p> : null}
        </div>
      ))}
      {message ? (
        <p className="platform-employees__message platform-employees__message--error">{message}</p>
      ) : null}
      <div className="employee-profile__form-actions">
        <Button disabled={submitting} onClick={onCancel}>
          取消
        </Button>
        <Button disabled={submitting} onClick={() => void submit()} variant="primary">
          {submitting ? '保存中…' : '保存自定义字段'}
        </Button>
      </div>
    </div>
  );
}

function renderField(field: FormField, value: unknown, onChange: (value: unknown) => void) {
  if (field.fieldType === 'textarea') {
    return (
      <Textarea
        label={field.label}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        value={toStringValue(value)}
      />
    );
  }
  if (field.fieldType === 'number') {
    return (
      <Input
        label={field.label}
        onChange={(event) => onChange(event.target.value)}
        type="number"
        value={toStringValue(value)}
      />
    );
  }
  if (field.fieldType === 'date') {
    return (
      <Input
        label={field.label}
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={toStringValue(value)}
      />
    );
  }
  if (field.fieldType === 'single_select') {
    return (
      <Select
        label={field.label}
        onChange={(event) => onChange(event.target.value)}
        value={toStringValue(value)}
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
      <div className="employee-profile__checkbox-group">
        <span className="employee-profile__field-label">{field.label}</span>
        {(field.options ?? []).map((option) => (
          <Checkbox
            checked={selected.includes(option.key)}
            key={option.key}
            label={option.label}
            onChange={() => {
              onChange(
                selected.includes(option.key)
                  ? selected.filter((item) => item !== option.key)
                  : [...selected, option.key],
              );
            }}
          />
        ))}
      </div>
    );
  }
  if (field.fieldType === 'file' || field.fieldType === 'image' || field.fieldType === 'employee') {
    return (
      <div className="employee-profile__readonly-field">
        <span className="employee-profile__field-label">{field.label}</span>
        <p>{formatDisplay(value)}</p>
        <p className="employee-profile__hint">该字段本期暂不支持在此编辑</p>
      </div>
    );
  }
  return (
    <Input
      label={field.label}
      onChange={(event) => onChange(event.target.value)}
      value={toStringValue(value)}
    />
  );
}

function buildInitialValues(
  fields: FormField[],
  originalValueByKey: Map<string, FormRecordValue>,
): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    values[field.fieldKey] = originalValueByKey.get(field.fieldKey)?.value ?? defaultValue(field);
  }
  return values;
}

function defaultValue(field: FormField): unknown {
  return field.fieldType === 'multi_select' ||
    field.fieldType === 'file' ||
    field.fieldType === 'image' ||
    field.fieldType === 'employee'
    ? []
    : '';
}

function normalizeValue(
  field: FormField,
  value: unknown,
  originalValue?: FormRecordValue,
): unknown {
  if (field.fieldType === 'file' || field.fieldType === 'image' || field.fieldType === 'employee') {
    return originalValue?.value ?? defaultValue(field);
  }
  if (field.fieldType === 'number') {
    return value === '' || value === undefined || value === null ? null : Number(value);
  }
  return value;
}

function validateRequired(fields: FormField[], values: FormValues): string | undefined {
  const missingField = fields.find((field) => field.required && isEmpty(values[field.fieldKey]));
  return missingField ? `请填写${missingField.label}` : undefined;
}

function isEmpty(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return value === undefined || value === null || String(value).trim() === '';
}

function formatDisplay(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(String).join('、') : '—';
  }
  if (value === undefined || value === null || value === '') {
    return '—';
  }
  return String(value);
}

function toStringValue(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function sortFields(left: FormField, right: FormField): number {
  return left.sortOrder - right.sortOrder || left.fieldKey.localeCompare(right.fieldKey);
}

function readError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
