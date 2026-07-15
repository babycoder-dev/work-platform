import type { ChangeEvent, FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, EmptyState, Input, Select, Table, Tag, Textarea, type TableColumn } from '@work/ui';
import type { CreatePresenceStatusRecordInput, PresenceStatusRecordDto, PresenceStatusTypeDto } from '@work/presence-contract';
import type { FormsDefinitionMirror } from '../api/forms-mirror';
import { DynamicFormFields, hasRequiredUnsupportedPresenceFields } from '../components/DynamicFormFields';
import { statusTagColor } from '../components/statusTagColor';
import { getCurrentUser, getPresenceApi, getPresenceFormsMirror } from '../runtime';

interface FormState {
  startAt: string;
  endAt: string;
  remark: string;
}

const INITIAL_FORM: FormState = { startAt: '', endAt: '', remark: '' };

type StatusTypesState =
  | { kind: 'loading' }
  | { kind: 'ready'; items: PresenceStatusTypeDto[] }
  | { kind: 'error'; message: string };

type DefinitionState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; definition: FormsDefinitionMirror }
  | { kind: 'error' };

type RecordsState =
  | { kind: 'loading' }
  | { kind: 'ready'; records: PresenceStatusRecordDto[] }
  | { kind: 'error'; message: string };

export default function RegisterStatusPage() {
  const currentUser = getCurrentUser();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [selectedStatus, setSelectedStatus] = useState<string>();
  const [statusTypesState, setStatusTypesState] = useState<StatusTypesState>({ kind: 'loading' });
  const [definitionState, setDefinitionState] = useState<DefinitionState>({ kind: 'idle' });
  const [recordsState, setRecordsState] = useState<RecordsState>({ kind: 'loading' });
  const [submitMessage, setSubmitMessage] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string>();

  const reloadRecords = useCallback(async () => {
    setRecordsState({ kind: 'loading' });
    try {
      const records = await getPresenceApi().listMyRecords();
      setRecordsState({ kind: 'ready', records });
    } catch (error) {
      setRecordsState({ kind: 'error', message: readError(error, '加载历史记录失败') });
    }
  }, []);

  const reloadStatusTypes = useCallback(async () => {
    setStatusTypesState({ kind: 'loading' });
    try {
      const items = await getPresenceApi().listStatusTypes();
      setStatusTypesState({ kind: 'ready', items });
    } catch (error) {
      setStatusTypesState({ kind: 'error', message: readError(error, '加载状态类型失败') });
    }
  }, []);

  useEffect(() => {
    void reloadStatusTypes();
    void reloadRecords();
  }, [reloadRecords, reloadStatusTypes]);

  const selectableTypes = useMemo(
    () =>
      statusTypesState.kind === 'ready'
        ? statusTypesState.items.filter((item) => item.status === 'active' && !item.isDefault)
        : [],
    [statusTypesState],
  );
  const labelByKey = useMemo(
    () =>
      new Map(
        statusTypesState.kind === 'ready'
          ? statusTypesState.items.map((item) => [item.key, item.label])
          : [],
      ),
    [statusTypesState],
  );

  useEffect(() => {
    setSelectedStatus((current) =>
      current && selectableTypes.some((item) => item.key === current)
        ? current
        : selectableTypes[0]?.key,
    );
  }, [selectableTypes]);

  useEffect(() => {
    if (!selectedStatus) {
      setDefinitionState({ kind: 'idle' });
      return;
    }
    let ignore = false;
    setFieldValues({});
    setDefinitionState({ kind: 'loading' });
    void getPresenceFormsMirror()
      .getPresenceStatusDefinition(selectedStatus)
      .then((definition) => {
        if (!ignore) setDefinitionState({ kind: 'ready', definition });
      })
      .catch(() => {
        if (!ignore) setDefinitionState({ kind: 'error' });
      });
    return () => {
      ignore = true;
    };
  }, [selectedStatus]);

  const activeFields = useMemo(
    () =>
      definitionState.kind === 'ready'
        ? definitionState.definition.fields.filter((field) => field.status === 'active')
        : [],
    [definitionState],
  );
  const hasRequiredUnsupportedFields = hasRequiredUnsupportedPresenceFields(activeFields);

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedStatus || hasRequiredUnsupportedFields) return;

      const missingField = activeFields.find(
        (field) => field.required && isSupportedField(field.fieldType) && isEmpty(fieldValues[field.fieldKey]),
      );
      if (missingField) {
        setSubmitMessage(`请填写${missingField.label}`);
        return;
      }
      const invalidNumberField = activeFields.find(
        (field) =>
          field.fieldType === 'number' &&
          !isEmpty(fieldValues[field.fieldKey]) &&
          Number.isNaN(Number(fieldValues[field.fieldKey])),
      );
      if (invalidNumberField) {
        setSubmitMessage(`请输入有效数字：${invalidNumberField.label}`);
        return;
      }
      if (!form.startAt) {
        setSubmitMessage('请填写开始时间');
        return;
      }

      const definition = definitionState.kind === 'ready' ? definitionState.definition : undefined;
      const values = activeFields
        .filter((field) => isSupportedField(field.fieldType) && !isEmpty(fieldValues[field.fieldKey]))
        .map((field) => ({
          fieldKey: field.fieldKey,
          value:
            field.fieldType === 'number'
              ? Number(fieldValues[field.fieldKey])
              : fieldValues[field.fieldKey],
        }));
      const input: CreatePresenceStatusRecordInput = {
        status: selectedStatus,
        startAt: toIsoString(form.startAt),
        endAt: form.endAt ? toIsoString(form.endAt) : undefined,
        remark: form.remark || undefined,
        ...(definition && activeFields.length > 0
          ? { form: { definitionRevision: definition.revision, values } }
          : {}),
      };

      setSubmitting(true);
      setSubmitMessage(undefined);
      try {
        await getPresenceApi().createRecord(input);
        setForm(INITIAL_FORM);
        setFieldValues({});
        await reloadRecords();
      } catch (error) {
        setSubmitMessage(readError(error, '提交登记失败'));
      } finally {
        setSubmitting(false);
      }
    },
    [
      activeFields,
      definitionState,
      fieldValues,
      form,
      hasRequiredUnsupportedFields,
      reloadRecords,
      selectedStatus,
    ],
  );

  const cancel = useCallback(
    async (id: string) => {
      setCancellingId(id);
      try {
        await getPresenceApi().cancelRecord(id);
        await reloadRecords();
      } catch (error) {
        setRecordsState({ kind: 'error', message: readError(error, '取消登记失败') });
      } finally {
        setCancellingId(undefined);
      }
    },
    [reloadRecords],
  );

  return (
    <section className="presence-register">
      <header className="presence-register__header">
        <h2>状态登记</h2>
      </header>

      <Card className="presence-register__profile" title="本人信息">
        <dl className="presence-register__profile-list">
          <div><dt>姓名</dt><dd>{currentUser.name}</dd></div>
          <div><dt>工号</dt><dd>{currentUser.employeeNo}</dd></div>
          {currentUser.departmentName ? <div><dt>部门</dt><dd>{currentUser.departmentName}</dd></div> : null}
        </dl>
      </Card>

      <Card title="登记离岗状态">
        {statusTypesState.kind === 'loading' ? <p className="presence-register__message">加载中…</p> : null}
        {statusTypesState.kind === 'error' ? <p className="presence-register__error">{statusTypesState.message}</p> : null}
        {statusTypesState.kind === 'ready' && selectableTypes.length === 0 ? (
          <EmptyState description="请联系管理员启用可登记的状态类型。" title="暂无可登记的状态类型" />
        ) : null}
        {statusTypesState.kind === 'ready' && selectableTypes.length > 0 ? (
          <form className="presence-register__form" noValidate onSubmit={submit}>
            <Select
              label="状态"
              onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedStatus(event.target.value)}
              value={selectedStatus ?? ''}
            >
              {selectableTypes.map((type) => <option key={type.id} value={type.key}>{type.label}</option>)}
            </Select>
            <Input
              label="开始时间"
              onChange={(event) => setForm((current) => ({ ...current, startAt: event.target.value }))}
              required
              type="datetime-local"
              value={form.startAt}
            />
            <Input
              label="结束时间（可选）"
              onChange={(event) => setForm((current) => ({ ...current, endAt: event.target.value }))}
              type="datetime-local"
              value={form.endAt}
            />
            <Textarea
              label="备注"
              onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
              rows={3}
              value={form.remark}
            />
            {definitionState.kind === 'loading' ? <p className="presence-register__message">加载填报模板…</p> : null}
            {definitionState.kind === 'error' ? <p className="presence-register__message">未能读取填报模板，仅提交基础信息</p> : null}
            {definitionState.kind === 'ready' && activeFields.length > 0 ? (
              <DynamicFormFields
                fields={activeFields}
                onChange={(fieldKey, value) => setFieldValues((current) => ({ ...current, [fieldKey]: value }))}
                values={fieldValues}
              />
            ) : null}
            {hasRequiredUnsupportedFields ? (
              <p className="presence-register__error">该状态的填报模板包含暂不支持的字段，请联系管理员调整</p>
            ) : null}
            {submitMessage ? <p className="presence-register__error">{submitMessage}</p> : null}
            <Button disabled={!selectedStatus || submitting || hasRequiredUnsupportedFields} type="submit" variant="primary">
              {submitting ? '提交中…' : '提交登记'}
            </Button>
          </form>
        ) : null}
      </Card>

      <Card title="我的最近记录" flush>
        {recordsState.kind === 'loading' ? <p className="presence-register__message">加载中…</p> : null}
        {recordsState.kind === 'error' ? <p className="presence-register__error">{recordsState.message}</p> : null}
        {recordsState.kind === 'ready' ? (
          <Table
            columns={historyColumns(labelByKey, cancellingId, cancel)}
            empty={<EmptyState description="登记后将在此显示。" title="暂无记录" />}
            rows={recordsState.records}
          />
        ) : null}
      </Card>
    </section>
  );
}

function historyColumns(
  labelByKey: Map<string, string>,
  cancellingId: string | undefined,
  onCancel: (id: string) => Promise<void>,
): Array<TableColumn<PresenceStatusRecordDto>> {
  return [
    {
      key: 'status',
      title: '状态',
      render: (record) => <Tag color={statusTagColor(record.status)} dot>{labelByKey.get(record.status) ?? record.status}</Tag>,
    },
    { key: 'startAt', title: '开始时间', render: (record) => formatDateTime(record.startAt) },
    { key: 'endAt', title: '结束时间', render: (record) => record.endAt ? formatDateTime(record.endAt) : '未设定结束时间' },
    { key: 'remark', title: '备注', render: (record) => record.remark ?? '—' },
    {
      key: 'action',
      title: '操作',
      render: (record) =>
        record.cancelledAt ? '已取消' : (
          <Button disabled={cancellingId === record.id} onClick={() => void onCancel(record.id)} size="sm">
            {cancellingId === record.id ? '取消中…' : '取消'}
          </Button>
        ),
    },
  ];
}

function isSupportedField(fieldType: string): boolean {
  return !['file', 'image', 'employee'].includes(fieldType);
}

function isEmpty(value: unknown): boolean {
  return Array.isArray(value) ? value.length === 0 : value === undefined || value === null || String(value).trim() === '';
}

function toIsoString(value: string): string {
  return new Date(value).toISOString();
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

function readError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
