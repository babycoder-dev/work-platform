import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, EmptyState, Icon, Table, Tag, type TableColumn } from '@work/ui';
import type { PresenceBoardEntryDto } from '@work/presence-contract';
import { statusTagColor } from '../components/statusTagColor';
import { getPresenceApi } from '../runtime';

type BoardRow = PresenceBoardEntryDto & { id: string };

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; items: PresenceBoardEntryDto[] }
  | { kind: 'error'; message: string };

export default function PresenceBoardPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const reload = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const items = await getPresenceApi().getBoard();
      setState({ kind: 'ready', items });
    } catch (error) {
      setState({ kind: 'error', message: readError(error) });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = useMemo<BoardRow[]>(
    () => (state.kind === 'ready' ? state.items.map((item) => ({ ...item, id: item.userId })) : []),
    [state],
  );
  const onDutyCount = state.kind === 'ready' ? state.items.filter((item) => item.isDefault).length : 0;
  const awayCount = state.kind === 'ready' ? state.items.length - onDutyCount : 0;

  return (
    <section className="presence-board">
      <header className="presence-board__header">
        <div>
          <h2>在位看板</h2>
          {state.kind === 'ready' ? <p>在岗 {onDutyCount} / 离岗 {awayCount}</p> : null}
        </div>
        <Button
          disabled={state.kind === 'loading'}
          icon={<Icon name="refresh" />}
          onClick={() => void reload()}
        >
          刷新
        </Button>
      </header>

      <Card flush>
        {state.kind === 'loading' ? <p className="presence-board__message">加载中…</p> : null}
        {state.kind === 'error' ? <p className="presence-board__error">{state.message}</p> : null}
        {state.kind === 'ready' ? (
          <Table
            columns={columns}
            empty={<EmptyState description="当前范围内没有成员。" title="暂无可见成员" />}
            rows={rows}
          />
        ) : null}
      </Card>
    </section>
  );
}

const columns: Array<TableColumn<BoardRow>> = [
  {
    key: 'member',
    title: '成员',
    render: (entry) => (
      <div className="presence-board__member">
        <strong>{entry.userName}</strong>
        <span>{entry.employeeNo}</span>
      </div>
    ),
  },
  {
    key: 'department',
    title: '部门',
    render: (entry) => entry.departmentName ?? '—',
  },
  {
    key: 'status',
    title: '状态',
    render: (entry) => (
      <Tag color={statusTagColor(entry.status)} dot>
        {entry.statusLabel}
      </Tag>
    ),
  },
  {
    key: 'time',
    title: '起止时间',
    render: (entry) => (entry.isDefault ? '—' : formatTimeRange(entry)),
  },
  {
    key: 'remark',
    title: '备注',
    render: (entry) => entry.remark ?? '—',
  },
];

function formatTimeRange(entry: PresenceBoardEntryDto): string {
  if (!entry.startAt) return '—';
  const startAt = formatDateTime(entry.startAt);
  return entry.endAt ? `${startAt} 至 ${formatDateTime(entry.endAt)}` : `${startAt} 起`;
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : '加载在位看板失败';
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}
