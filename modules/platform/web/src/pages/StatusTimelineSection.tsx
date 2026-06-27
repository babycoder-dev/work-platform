import { useEffect, useRef, useState } from 'react';
import { Button, EmptyState, Pager } from '@work/ui';
import type { EmployeeDto, ListStatusLogsResult } from '@work/platform-contract';
import { getPlatformRolesApi } from '../runtime';
import '../styles.css';

export const STATUS_TIMELINE_PAGE_SIZE = 20;

type TimelineState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; result: ListStatusLogsResult }
  | { kind: 'error'; message: string };

export function StatusTimelineSection({
  employee,
  employeeNameById,
  refreshKey,
}: {
  employee: EmployeeDto | null;
  employeeNameById: Map<string, string>;
  refreshKey: number;
}) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState<TimelineState>({ kind: 'idle' });
  const [reloadKey, setReloadKey] = useState(0);
  const employeeId = employee?.id;
  const resetKey = `${employeeId ?? ''}:${refreshKey}`;
  const lastResetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (!employeeId) {
      setState({ kind: 'idle' });
      lastResetKeyRef.current = resetKey;
      return undefined;
    }

    if (lastResetKeyRef.current !== resetKey) {
      lastResetKeyRef.current = resetKey;
      if (page !== 1) {
        setState({ kind: 'loading' });
        setPage(1);
        return undefined;
      }
    }

    let ignore = false;
    setState({ kind: 'loading' });
    void getPlatformRolesApi()
      .listStatusLogs(employeeId, {
        limit: STATUS_TIMELINE_PAGE_SIZE,
        offset: (page - 1) * STATUS_TIMELINE_PAGE_SIZE,
      })
      .then((result) => {
        if (ignore) {
          return;
        }
        const pageCount = Math.max(1, Math.ceil(result.total / STATUS_TIMELINE_PAGE_SIZE));
        if (page > pageCount) {
          setPage(pageCount);
          return;
        }
        setState({ kind: 'ready', result });
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setState({ kind: 'error', message: readError(error, '加载近况记录失败') });
        }
      });

    return () => {
      ignore = true;
    };
  }, [employeeId, page, reloadKey, resetKey]);

  if (!employee) {
    return null;
  }

  if (state.kind === 'loading' || state.kind === 'idle') {
    return <p>加载中…</p>;
  }

  if (state.kind === 'error') {
    return (
      <div className="status-timeline__state">
        <p className="platform-employees__message platform-employees__message--error">
          {state.message}
        </p>
        <Button onClick={() => setReloadKey((current) => current + 1)} size="sm">
          重试
        </Button>
      </div>
    );
  }

  if (state.result.items.length === 0) {
    return <EmptyState title="暂无近况记录" description="该员工还没有近况记录。" />;
  }

  return (
    <div className="status-timeline">
      <ol className="status-timeline__list">
        {state.result.items.map((item) => (
          <li className="status-timeline__item" key={item.id}>
            <div className="status-timeline__meta">
              <strong>
                {employeeNameById.get(item.authorEmployeeId) ?? item.authorEmployeeId}
              </strong>
              <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
            </div>
            <p className="status-timeline__content">{item.content}</p>
          </li>
        ))}
      </ol>
      <Pager
        onChange={setPage}
        page={page}
        pageSize={STATUS_TIMELINE_PAGE_SIZE}
        total={state.result.total}
      />
    </div>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function readError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
