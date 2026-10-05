import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PresenceBoardEntryDto } from '@work/presence-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPresenceRuntimeForTest, setPresenceRuntime } from '../runtime';
import PresenceBoardPage from './PresenceBoardPage';

function entry(overrides: Partial<PresenceBoardEntryDto> = {}): PresenceBoardEntryDto {
  return {
    userId: 'user-001',
    employeeNo: 'E001',
    userName: 'Alice',
    departmentId: 'department-001',
    departmentName: '运营',
    status: 'working',
    statusLabel: '在岗',
    isDefault: true,
    ...overrides,
  };
}

describe('PresenceBoardPage', () => {
  const get = vi.fn();

  beforeEach(() => {
    get.mockReset();
    setPresenceRuntime({
      currentUser: { id: 'user-001' } as never,
      createHttpClient: () => ({ get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }) as never,
    });
  });

  afterEach(() => {
    __resetPresenceRuntimeForTest();
    vi.restoreAllMocks();
  });

  it('renders roster rows with default status, realtime departments, and server labels', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    get.mockResolvedValueOnce({
      items: [
        entry(),
        entry({ userId: 'user-002', employeeNo: 'E002', userName: 'Bob', departmentName: '产品' }),
        entry({
          userId: 'user-003',
          employeeNo: 'E003',
          userName: 'Carol',
          departmentName: '客户成功',
          status: 'business_trip',
          statusLabel: '出差',
          isDefault: false,
          startAt: '2026-05-26T01:00:00.000Z',
          endAt: '2026-05-26T09:00:00.000Z',
          remark: '客户拜访',
          recordId: 'record-003',
        }),
        entry({
          userId: 'user-004',
          employeeNo: 'E004',
          userName: 'Dora',
          departmentName: '战略',
          status: 'client_visit',
          statusLabel: '客户驻场',
          isDefault: false,
          startAt: '2026-05-26T02:00:00.000Z',
          recordId: 'record-004',
        }),
      ],
    });

    render(<PresenceBoardPage />);

    await waitFor(() => expect(screen.getByText('Dora')).toBeInTheDocument());
    expect(screen.getByText('E001')).toBeInTheDocument();
    expect(screen.getByText('客户成功')).toBeInTheDocument();
    expect(screen.getByText('客户驻场')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getAllByRole('cell')[3]).toHaveTextContent('—');
    expect(within(rows[2]).getAllByRole('cell')[3]).toHaveTextContent('—');
    expect(screen.getByText('客户拜访')).toBeInTheDocument();
    expect(screen.getByText('在岗 2 / 离岗 2')).toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders the empty roster state', async () => {
    get.mockResolvedValueOnce({ items: [] });

    render(<PresenceBoardPage />);

    expect(await screen.findByText('暂无可见成员')).toBeInTheDocument();
  });

  it('renders an error state when loading fails', async () => {
    get.mockRejectedValueOnce(new Error('boom'));

    render(<PresenceBoardPage />);

    expect(await screen.findByText('boom')).toBeInTheDocument();
  });

  it('reloads the roster when refreshed', async () => {
    get
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [entry({ userName: 'Bob', userId: 'user-002' })] });
    render(<PresenceBoardPage />);

    await screen.findByText('暂无可见成员');
    await userEvent.click(screen.getByRole('button', { name: '刷新' }));

    expect(await screen.findByText('Bob')).toBeInTheDocument();
  });
});
