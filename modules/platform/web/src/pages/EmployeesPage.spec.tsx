import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DepartmentDto, EmployeeDto, StatusLogDto } from '@work/platform-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPlatformRuntimeForTest, setPlatformRuntime } from '../runtime';
import EmployeesPage from './EmployeesPage';

describe('EmployeesPage', () => {
  const get = vi.fn();
  const post = vi.fn();

  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    setRuntimeWithPermissions(['platform:employee:view', 'platform:status-log:create']);
  });

  afterEach(() => {
    __resetPlatformRuntimeForTest();
    vi.restoreAllMocks();
  });

  it('renders the scoped employee list with department names and status tags', async () => {
    mockReady();
    render(<EmployeesPage />);

    expect(screen.getByText('加载中…')).toBeInTheDocument();
    expect(await screen.findByText('员工管理')).toBeInTheDocument();
    expect(screen.getByText('查看员工档案、账号状态与近况记录。')).toBeInTheDocument();
    expect(screen.getByText('姓名')).toBeInTheDocument();
    expect(screen.getByText('工号')).toBeInTheDocument();
    expect(screen.getByText('账号')).toBeInTheDocument();
    expect(screen.getAllByText('研发部')[0]).toBeInTheDocument();
    expect(screen.getByText('工程师')).toBeInTheDocument();
    expect(screen.getByText('在职')).toBeInTheDocument();
  });

  it('keeps timeline readable with view permission but hides batch entry without create permission', async () => {
    __resetPlatformRuntimeForTest();
    setRuntimeWithPermissions(['platform:employee:view']);
    mockReady();
    mockStatusLogs([]);
    render(<EmployeesPage />);

    expect(await screen.findByText('张伟')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '批量记录近况' })).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: '查看详情' })[0]);

    expect(await screen.findByText('成员详情')).toBeInTheDocument();
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('employees/employee-001/status-logs?limit=20&offset=0'),
    );
  });

  it('opens a paged status timeline and falls back to author id when the author is not visible', async () => {
    mockReady();
    mockStatusLogs(
      [statusLog({ id: 'log-001', authorEmployeeId: 'employee-author', content: '完成客户回访' })],
      21,
    );
    render(<EmployeesPage />);

    await userEvent.click((await screen.findAllByRole('button', { name: '查看详情' }))[0]);

    expect(await screen.findByText('成员详情')).toBeInTheDocument();
    expect(screen.getByText('employee-author')).toBeInTheDocument();
    expect(screen.getByText('完成客户回访')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('employees/employee-001/status-logs?limit=20&offset=20'),
    );
  });

  it('shows an empty state for employees without status logs', async () => {
    mockReady();
    mockStatusLogs([]);
    render(<EmployeesPage />);

    await userEvent.click((await screen.findAllByRole('button', { name: '查看详情' }))[0]);

    expect(await screen.findByText('暂无近况记录')).toBeInTheDocument();
    expect(screen.getByText('该员工还没有近况记录。')).toBeInTheDocument();
  });

  it('creates batch status logs with trimmed content and refreshes the open timeline', async () => {
    mockReady();
    mockStatusLogs([]);
    post.mockResolvedValueOnce([
      statusLog({ subjectEmployeeId: 'employee-001', content: '完成客户回访' }),
    ]);
    render(<EmployeesPage />);

    await userEvent.click(await screen.findByRole('button', { name: '批量记录近况' }));
    await userEvent.click(screen.getByLabelText('张伟（000001）'));
    await userEvent.type(screen.getByLabelText('近况内容'), '  完成客户回访  ');
    await userEvent.click(screen.getByRole('button', { name: '记录近况' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('status-logs', {
        subjectEmployeeIds: ['employee-001'],
        content: '完成客户回访',
      }),
    );
    expect(await screen.findByText('已为 1 名员工记录近况。')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '批量记录近况' })).not.toBeInTheDocument();
  });

  it('returns the open timeline to the first page after creating a status log for that employee', async () => {
    let created = false;
    get.mockImplementation((url: string) => {
      if (url === 'employees') {
        return Promise.resolve({ items: employees() });
      }
      if (url === 'departments') {
        return Promise.resolve({ items: departments() });
      }
      if (url === 'employees/employee-001/status-logs?limit=20&offset=0') {
        return Promise.resolve({
          items: created
            ? [statusLog({ id: 'log-new', content: '新记录在第一页' })]
            : [statusLog({ id: 'log-first', content: '第一页旧记录' })],
          total: 21,
        });
      }
      if (url === 'employees/employee-001/status-logs?limit=20&offset=20') {
        return Promise.resolve({
          items: [statusLog({ id: 'log-second', content: '第二页旧记录' })],
          total: 21,
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
    post.mockImplementationOnce(() => {
      created = true;
      return Promise.resolve([
        statusLog({ subjectEmployeeId: 'employee-001', content: '新记录在第一页' }),
      ]);
    });
    render(<EmployeesPage />);

    await userEvent.click((await screen.findAllByRole('button', { name: '查看详情' }))[0]);
    expect(await screen.findByText('第一页旧记录')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(await screen.findByText('第二页旧记录')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '批量记录近况' }));
    await userEvent.click(screen.getByLabelText('张伟（000001）'));
    await userEvent.type(screen.getByLabelText('近况内容'), '新记录在第一页');
    await userEvent.click(screen.getByRole('button', { name: '记录近况' }));

    expect(await screen.findByText('新记录在第一页')).toBeInTheDocument();
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('employees/employee-001/status-logs?limit=20&offset=0'),
    );
  });

  it('clamps the timeline page when the new total no longer has the current page', async () => {
    let collapsed = false;
    get.mockImplementation((url: string) => {
      if (url === 'employees') {
        return Promise.resolve({ items: employees() });
      }
      if (url === 'departments') {
        return Promise.resolve({ items: departments() });
      }
      if (url === 'employees/employee-001/status-logs?limit=20&offset=0') {
        return Promise.resolve({
          items: [
            statusLog({
              id: collapsed ? 'log-only' : 'log-first',
              content: collapsed ? '唯一剩余记录' : '第一页记录',
            }),
          ],
          total: collapsed ? 1 : 21,
        });
      }
      if (url === 'employees/employee-001/status-logs?limit=20&offset=20') {
        collapsed = true;
        return Promise.resolve({ items: [], total: 1 });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
    render(<EmployeesPage />);

    await userEvent.click((await screen.findAllByRole('button', { name: '查看详情' }))[0]);
    expect(await screen.findByText('第一页记录')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '下一页' }));

    expect(await screen.findByText('唯一剩余记录')).toBeInTheDocument();
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('employees/employee-001/status-logs?limit=20&offset=0'),
    );
  });

  it('opens a different employee timeline on the first page without issuing the stale previous offset', async () => {
    mockReady();
    mockEmployeeStatusLogs();
    render(<EmployeesPage />);

    await userEvent.click((await screen.findAllByRole('button', { name: '查看详情' }))[0]);
    expect(await screen.findByText('张伟第一页')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(await screen.findByText('张伟第二页')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));

    await userEvent.click(screen.getAllByRole('button', { name: '查看详情' })[1]);

    expect(await screen.findByText('李四第一页')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalledWith('employees/employee-002/status-logs?limit=20&offset=20');
  });

  it('clears the success banner when the employee list is refreshed', async () => {
    mockReady();
    post.mockResolvedValueOnce([
      statusLog({ subjectEmployeeId: 'employee-001', content: '完成客户回访' }),
    ]);
    render(<EmployeesPage />);

    await userEvent.click(await screen.findByRole('button', { name: '批量记录近况' }));
    await userEvent.click(screen.getByLabelText('张伟（000001）'));
    await userEvent.type(screen.getByLabelText('近况内容'), '完成客户回访');
    await userEvent.click(screen.getByRole('button', { name: '记录近况' }));
    expect(await screen.findByText('已为 1 名员工记录近况。')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '刷新' }));

    await waitFor(() =>
      expect(screen.queryByText('已为 1 名员工记录近况。')).not.toBeInTheDocument(),
    );
  });

  it('blocks invalid batch input before calling the API', async () => {
    mockReady();
    render(<EmployeesPage />);

    await userEvent.click(await screen.findByRole('button', { name: '批量记录近况' }));
    await userEvent.click(screen.getByRole('button', { name: '记录近况' }));

    expect(screen.getByText('请至少选择 1 名员工')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await userEvent.click(screen.getByLabelText('张伟（000001）'));
    await userEvent.click(screen.getByRole('button', { name: '记录近况' }));

    expect(screen.getByText('请输入近况内容')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps the modal open and shows the backend message when the batch is rejected', async () => {
    mockReady();
    post.mockRejectedValueOnce(new Error('部分员工不存在或无权记录近况'));
    render(<EmployeesPage />);

    await userEvent.click(await screen.findByRole('button', { name: '批量记录近况' }));
    await userEvent.click(screen.getByLabelText('张伟（000001）'));
    await userEvent.type(screen.getByLabelText('近况内容'), '入职资料已补齐');
    await userEvent.click(screen.getByRole('button', { name: '记录近况' }));

    expect(await screen.findByText('部分员工不存在或无权记录近况')).toBeInTheDocument();
    expect(screen.getAllByText('批量记录近况')).toHaveLength(2);
  });

  it('shows a retryable error when the main employee list fails', async () => {
    get.mockImplementation((url: string) => {
      if (url === 'employees') {
        return Promise.reject(new Error('员工列表加载失败'));
      }
      if (url === 'departments') {
        return Promise.resolve({ items: departments() });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
    render(<EmployeesPage />);

    expect(await screen.findByText('员工列表加载失败')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '刷新重试' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('employees'));
  });

  function setRuntimeWithPermissions(codes: string[]) {
    setPlatformRuntime({
      currentUser: {
        id: 'user-admin',
        enterpriseId: 'ent-default',
        permissions: codes.map((code) => ({ code })),
      } as never,
      createHttpClient: () =>
        ({ get, post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() }) as never,
    });
  }

  function mockReady() {
    get.mockImplementation((url: string) => {
      if (url === 'employees') {
        return Promise.resolve({ items: employees() });
      }
      if (url === 'departments') {
        return Promise.resolve({ items: departments() });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
  }

  function mockStatusLogs(items: StatusLogDto[], total = items.length) {
    get.mockImplementation((url: string) => {
      if (url === 'employees') {
        return Promise.resolve({ items: employees() });
      }
      if (url === 'departments') {
        return Promise.resolve({ items: departments() });
      }
      if (url.startsWith('employees/employee-001/status-logs')) {
        return Promise.resolve({ items, total });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
  }

  function mockEmployeeStatusLogs() {
    get.mockImplementation((url: string) => {
      if (url === 'employees') {
        return Promise.resolve({ items: employees() });
      }
      if (url === 'departments') {
        return Promise.resolve({ items: departments() });
      }
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

function employees(): EmployeeDto[] {
  return [
    employee({
      id: 'employee-001',
      employeeNo: '000001',
      account: 'zhangwei',
      name: '张伟',
      departmentId: 'dept-rd',
      title: '工程师',
    }),
    employee({
      id: 'employee-002',
      employeeNo: '000002',
      account: 'lisi',
      name: '李四',
      departmentId: 'dept-rd',
      title: undefined,
      status: 'disabled',
    }),
  ];
}

function departments(): DepartmentDto[] {
  return [
    {
      id: 'dept-rd',
      enterpriseId: 'ent-default',
      code: 'RD',
      name: '研发部',
      sortOrder: 1,
      status: 'active',
    },
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
