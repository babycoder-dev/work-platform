import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EmployeeDto, StatusLogDto } from '@work/platform-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPlatformRuntimeForTest, setPlatformRuntime } from '../runtime';
import { StatusTimelineSection } from './StatusTimelineSection';

describe('StatusTimelineSection', () => {
  const get = vi.fn();

  beforeEach(() => {
    get.mockReset();
    setPlatformRuntime({
      currentUser: {
        id: 'user-admin',
        enterpriseId: 'ent-default',
        permissions: [{ code: 'platform:employee:view' }],
      } as never,
      createHttpClient: () =>
        ({ get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }) as never,
    });
  });

  afterEach(() => {
    __resetPlatformRuntimeForTest();
    vi.restoreAllMocks();
  });

  it('renders status logs with author name fallback and paginates with offset', async () => {
    mockStatusLogs(
      [statusLog({ id: 'log-001', authorEmployeeId: 'employee-author', content: '完成客户回访' })],
      21,
    );

    render(
      <StatusTimelineSection employee={employee()} employeeNameById={new Map()} refreshKey={0} />,
    );

    expect(await screen.findByText('employee-author')).toBeInTheDocument();
    expect(screen.getByText('完成客户回访')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('employees/employee-001/status-logs?limit=20&offset=20'),
    );
  });

  it('shows the empty state when no status logs exist', async () => {
    mockStatusLogs([]);

    render(
      <StatusTimelineSection employee={employee()} employeeNameById={new Map()} refreshKey={0} />,
    );

    expect(await screen.findByText('暂无近况记录')).toBeInTheDocument();
    expect(screen.getByText('该员工还没有近况记录。')).toBeInTheDocument();
  });

  it('loads a new employee on the first page without the stale previous offset', async () => {
    mockEmployeeStatusLogs();
    const { rerender } = render(
      <StatusTimelineSection
        employee={employee({ id: 'employee-001', name: '张伟' })}
        employeeNameById={new Map()}
        refreshKey={0}
      />,
    );

    expect(await screen.findByText('张伟第一页')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(await screen.findByText('张伟第二页')).toBeInTheDocument();

    rerender(
      <StatusTimelineSection
        employee={employee({ id: 'employee-002', name: '李四' })}
        employeeNameById={new Map()}
        refreshKey={0}
      />,
    );

    expect(await screen.findByText('李四第一页')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalledWith('employees/employee-002/status-logs?limit=20&offset=20');
  });

  function mockStatusLogs(items: StatusLogDto[], total = items.length) {
    get.mockImplementation((url: string) => {
      if (url.startsWith('employees/employee-001/status-logs')) {
        return Promise.resolve({ items, total });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
  }

  function mockEmployeeStatusLogs() {
    get.mockImplementation((url: string) => {
      if (url === 'employees/employee-001/status-logs?limit=20&offset=0') {
        return Promise.resolve({
          items: [statusLog({ id: 'zhang-page-1', content: '张伟第一页' })],
          total: 21,
        });
      }
      if (url === 'employees/employee-001/status-logs?limit=20&offset=20') {
        return Promise.resolve({
          items: [statusLog({ id: 'zhang-page-2', content: '张伟第二页' })],
          total: 21,
        });
      }
      if (url === 'employees/employee-002/status-logs?limit=20&offset=0') {
        return Promise.resolve({
          items: [
            statusLog({
              id: 'lisi-page-1',
              subjectEmployeeId: 'employee-002',
              content: '李四第一页',
            }),
          ],
          total: 1,
        });
      }
      if (url === 'employees/employee-002/status-logs?limit=20&offset=20') {
        return Promise.resolve({ items: [], total: 1 });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
  }
});

function employee(overrides: Partial<EmployeeDto> = {}): EmployeeDto {
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

function statusLog(overrides: Partial<StatusLogDto> = {}): StatusLogDto {
  return {
    id: 'log-001',
    enterpriseId: 'ent-default',
    subjectEmployeeId: 'employee-001',
    authorEmployeeId: 'employee-001',
    content: '近况内容',
    createdAt: '2026-06-24T08:00:00.000Z',
    ...overrides,
  };
}
