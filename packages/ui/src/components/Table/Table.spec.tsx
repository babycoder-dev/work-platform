import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table } from './Table';

describe('Table', () => {
  const columns = [{ key: 'name', title: '名称', render: (row: { id: string; name: string }) => row.name }];

  it('renders rows and selected class', () => {
    render(<Table columns={columns} rows={[{ id: '1', name: '工作台' }]} selectedRowIds={['1']} />);

    expect(screen.getByRole('columnheader', { name: '名称' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '工作台' }).closest('tr')).toHaveClass('work-table__row--selected');
  });

  it('renders empty state when no rows exist', () => {
    render(<Table columns={columns} rows={[]} />);

    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });
});
