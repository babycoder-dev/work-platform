import type { ChangeEvent, FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CreatePresenceStatusRecordInput, PresenceStatus, PresenceStatusRecordDto } from '@work/presence-contract';
import { formatStatusLabel } from '../components/StatusBadge';
import { getPresenceApi } from '../runtime';

const STATUS_CHOICES: PresenceStatus[] = ['business_trip', 'field_research', 'out', 'leave'];

interface FormState {
  status: PresenceStatus;
  startAt: string;
  endAt: string;
  remark: string;
}

const INITIAL_FORM: FormState = {
  status: 'business_trip',
  startAt: '',
  endAt: '',
  remark: '',
};

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

type ListState =
  | { kind: 'loading' }
  | { kind: 'ready'; records: PresenceStatusRecordDto[] }
  | { kind: 'error'; message: string };

export default function RegisterStatusPage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });
  const [listState, setListState] = useState<ListState>({ kind: 'loading' });
  const [cancellingId, setCancellingId] = useState<string | undefined>();

  const reloadMine = useCallback(async () => {
    setListState({ kind: 'loading' });
    try {
      const records = await getPresenceApi().listMyRecords();
      setListState({ kind: 'ready', records });
    } catch (error) {
      setListState({ kind: 'error', message: readError(error) });
    }
  }, []);

  useEffect(() => {
    void reloadMine();
  }, [reloadMine]);

  const onTextField = useCallback((field: 'startAt' | 'endAt' | 'remark') => {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setForm((current) => ({ ...current, [field]: value }));
    };
  }, []);

  const onStatusChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as PresenceStatus;
    setForm((current) => ({ ...current, status: value }));
  }, []);

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitState({ kind: 'submitting' });
      const input: CreatePresenceStatusRecordInput = {
        status: form.status,
        startAt: toIsoString(form.startAt),
        endAt: form.endAt ? toIsoString(form.endAt) : undefined,
        remark: form.remark ? form.remark : undefined,
      };
      try {
        await getPresenceApi().createRecord(input);
        setSubmitState({ kind: 'idle' });
        setForm(INITIAL_FORM);
        await reloadMine();
      } catch (error) {
        setSubmitState({ kind: 'error', message: readError(error) });
      }
    },
    [form, reloadMine],
  );

  const cancel = useCallback(
    async (id: string) => {
      setCancellingId(id);
      try {
        await getPresenceApi().cancelRecord(id);
        await reloadMine();
      } catch (error) {
        setListState({ kind: 'error', message: readError(error) });
      } finally {
        setCancellingId(undefined);
      }
    },
    [reloadMine],
  );

  const activeRecords = useMemo(() => {
    return listState.kind === 'ready' ? listState.records.filter((record) => record.cancelledAt === undefined) : [];
  }, [listState]);

  return (
    <section className="presence-register">
      <h2>状态登记</h2>
      <form className="presence-register__form" onSubmit={submit}>
        <label>
          状态
          <select onChange={onStatusChange} value={form.status}>
            {STATUS_CHOICES.map((status) => (
              <option key={status} value={status}>
                {formatStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          开始时间
          <input onChange={onTextField('startAt')} required type="datetime-local" value={form.startAt} />
        </label>
        <label>
          结束时间（可选）
          <input onChange={onTextField('endAt')} type="datetime-local" value={form.endAt} />
        </label>
        <label>
          备注
          <textarea onChange={onTextField('remark')} rows={3} value={form.remark} />
        </label>
        {submitState.kind === 'error' ? <p className="presence-register__error">{submitState.message}</p> : null}
        <button disabled={submitState.kind === 'submitting' || !form.startAt} type="submit">
          {submitState.kind === 'submitting' ? '提交中…' : '提交登记'}
        </button>
      </form>

      <section className="presence-register__history">
        <h3>我的最近记录</h3>
        {listState.kind === 'loading' ? <p>加载中…</p> : null}
        {listState.kind === 'error' ? <p className="presence-register__error">{listState.message}</p> : null}
        {listState.kind === 'ready' && listState.records.length === 0 ? <p>暂无记录。</p> : null}
        {listState.kind === 'ready' && listState.records.length > 0 ? (
          <ul>
            {listState.records.map((record) => {
              const isActive = activeRecords.some((active) => active.id === record.id);
              return (
                <li key={record.id}>
                  <span>{formatStatusLabel(record.status)}</span>
                  <span>{formatDateTime(record.startAt)}</span>
                  <span>{record.endAt ? formatDateTime(record.endAt) : '未设定结束时间'}</span>
                  {record.cancelledAt ? <span>（已取消）</span> : null}
                  {isActive ? (
                    <button disabled={cancellingId === record.id} onClick={() => void cancel(record.id)} type="button">
                      {cancellingId === record.id ? '取消中…' : '取消'}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </section>
  );
}

function readError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return '请求失败';
}

function toIsoString(value: string): string {
  return new Date(value).toISOString();
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}
