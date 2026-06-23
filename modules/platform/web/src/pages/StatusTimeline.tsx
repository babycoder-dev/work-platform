import { useCallback, useEffect, useState } from 'react';
import { Button, Drawer, EmptyState, Pager } from '@work/ui';
import type { EmployeeDto, ListStatusLogsResult } from '@work/platform-contract';
import { getPlatformRolesApi } from '../runtime';
import '../styles.css';

export const STATUS_TIMELINE_PAGE_SIZE = 20;

type TimelineState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; result: ListStatusLogsResult }
  | { kind: 'error'; message: string };

export function StatusTimeline({
  employee,
  employeeNameById,
  open,
  refreshKey,
  onClose,
}: {
  employee: EmployeeDto | null;
  employeeNameById: Map<string, string>;
  open: boolean;
  refreshKey: number;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState<TimelineState>({ kind: 'idle' });
  const employeeId = employee?.id;

  const reload = useCallback(async () => {
    if (!open || !employeeId) {
      setState({ kind: 'idle' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const result = await getPlatformRolesApi().listStatusLogs(employeeId, {
        limit: STATUS_TIMELINE_PAGE_SIZE,
        offset: (page - 1) * STATUS_TIMELINE_PAGE_SIZE,
      });
      setState({ kind: 'ready', result });
    } catch (error) {
      setState({ kind: 'error', message: readError(error, '加载近况记录失败') });
    }
  }, [employeeId, open, page]);

  useEffect(() => {
    if (open) {
      setPage(1);
    }
  }, [employeeId, open]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  if (!employee) {
    return null;
  }

  return (
    <Drawer onClose={onClose} open={open} title={`${employee.name} 的近况脉络`}>
      {state.kind === 'loading' ? <p>加载中…</p> : null}
      {state.kind === 'error' ? (
        <div className="status-timeline__state">
          <p className="platform-employees__message platform-employees__message--error">{state.message}</p>
          <Button onClick={() => void reload()} size="sm">重试</Button>
        </div>
      ) : null}
      {state.kind === 'ready' && state.result.items.length === 0 ? (
        <EmptyState title="暂无近况记录" description="该员工还没有近况记录。" />
      ) : null}
      {state.kind === 'ready' && state.result.items.length > 0 ? (
        <div className="status-timeline">
          <ol className="status-timeline__list">
            {state.result.items.map((item) => (
              <li className="status-timeline__item" key={item.id}>
                <div className="status-timeline__meta">
                  <strong>{employeeNameById.get(item.authorEmployeeId) ?? item.authorEmployeeId}</strong>
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
      ) : null}
    </Drawer>
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
