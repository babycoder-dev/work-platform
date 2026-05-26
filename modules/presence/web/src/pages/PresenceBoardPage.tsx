import { useCallback, useEffect, useState } from 'react';
import type { PresenceStatusRecordDto } from '@work/presence-contract';
import { StatusBadge } from '../components/StatusBadge';
import { getPresenceApi } from '../runtime';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; records: PresenceStatusRecordDto[] }
  | { kind: 'error'; message: string };

export default function PresenceBoardPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const reload = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const records = await getPresenceApi().getBoard();
      setState({ kind: 'ready', records });
    } catch (error) {
      setState({ kind: 'error', message: readError(error) });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section className="presence-board">
      <header className="presence-board__header">
        <h2>在位看板</h2>
        <button disabled={state.kind === 'loading'} onClick={() => void reload()} type="button">
          刷新
        </button>
      </header>
      {state.kind === 'loading' ? <p>加载中…</p> : null}
      {state.kind === 'error' ? <p className="presence-board__error">{state.message}</p> : null}
      {state.kind === 'ready' && state.records.length === 0 ? <p>当前没有进行中的在位记录。</p> : null}
      {state.kind === 'ready' && state.records.length > 0 ? (
        <ul className="presence-board__list">
          {state.records.map((record) => (
            <li key={record.id}>
              <div>
                <strong>{record.userName}</strong>
                <span className="presence-board__dept">{record.departmentName}</span>
              </div>
              <StatusBadge status={record.status} />
              <div className="presence-board__time">
                <span>开始：{formatDateTime(record.startAt)}</span>
                {record.endAt ? <span>结束：{formatDateTime(record.endAt)}</span> : <span>结束：未设定</span>}
              </div>
              {record.remark ? <p className="presence-board__remark">备注：{record.remark}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function readError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return '加载在位看板失败';
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}
