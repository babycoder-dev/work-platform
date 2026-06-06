import type { ReactNode } from 'react';
import { EmptyState } from '../EmptyState/EmptyState';

export interface TableColumn<T> {
  key: string;
  title: ReactNode;
  render: (row: T) => ReactNode;
}

export function Table<T extends { id: string }>({
  columns,
  rows,
  selectedRowIds = [],
  empty,
}: {
  columns: Array<TableColumn<T>>;
  rows: T[];
  selectedRowIds?: string[];
  empty?: ReactNode;
}) {
  if (rows.length === 0) {
    return <>{empty ?? <EmptyState title="暂无数据" description="数据待接入后将在此展示。" />}</>;
  }

  return (
    <div className="work-table-wrap">
      <table className="work-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              className={selectedRowIds.includes(row.id) ? 'work-table__row--selected' : undefined}
              key={row.id}
            >
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
