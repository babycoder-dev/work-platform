import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EmployeeDto } from '@work/platform-contract';
import { describe, expect, it, vi } from 'vitest';
import { EmployeePicker } from './EmployeePicker';

describe('EmployeePicker', () => {
  it('filters employees by name, employee number, and account', async () => {
    render(<EmployeePicker employees={employees()} onChange={vi.fn()} value={[]} />);

    await userEvent.type(screen.getByLabelText('搜索姓名 / 工号 / 账号'), 'lisi');

    expect(screen.getByLabelText('李四（000002）')).toBeInTheDocument();
    expect(screen.queryByLabelText('张伟（000001）')).not.toBeInTheDocument();
  });

  it('toggles selected employees and reports selected count', async () => {
    const onChange = vi.fn();
    render(<EmployeePicker employees={employees()} onChange={onChange} value={['employee-001']} />);

    expect(screen.getByText('已选 1 人')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('张伟（000001）'));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('disables unselected employees after reaching the maximum', () => {
    const selected = Array.from({ length: 100 }, (_, index) => `selected-${index}`);
    render(
      <EmployeePicker
        employees={employees()}
        maxSelected={100}
        onChange={vi.fn()}
        value={selected}
      />,
    );

    expect(screen.getByText('最多选择 100 人')).toBeInTheDocument();
    expect(screen.getByLabelText('张伟（000001）')).toBeDisabled();
  });

  it('shows an empty state when no employees match the search', async () => {
    render(<EmployeePicker employees={employees()} onChange={vi.fn()} value={[]} />);

    await userEvent.type(screen.getByLabelText('搜索姓名 / 工号 / 账号'), 'nobody');

    expect(screen.getByText('暂无匹配员工')).toBeInTheDocument();
  });
});

function employees(): EmployeeDto[] {
  return [
    employee({ id: 'employee-001', employeeNo: '000001', account: 'zhangwei', name: '张伟' }),
    employee({ id: 'employee-002', employeeNo: '000002', account: 'lisi', name: '李四' }),
  ];
}

function employee(overrides: Partial<EmployeeDto>): EmployeeDto {
  return {
    id: 'employee-001',
    enterpriseId: 'ent-default',
    employeeNo: '000001',
    account: 'zhangwei',
    name: '张伟',
    status: 'active',
    roleIds: [],
    mustChangePassword: false,
    ...overrides,
  };
}
