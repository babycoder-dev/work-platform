import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DepartmentDto, EmployeeDto } from '@work/platform-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPlatformRuntimeForTest, setPlatformRuntime } from '../runtime';
import OrganizationPage from './OrganizationPage';

describe('OrganizationPage', () => {
  const get = vi.fn();
  const post = vi.fn();
  const put = vi.fn();
  const del = vi.fn();

  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    put.mockReset();
    del.mockReset();
    setPlatformRuntime({
      currentUser: {
        id: 'user-admin',
        enterpriseId: 'ent-default',
        permissions: [{ code: 'platform:org:view' }, { code: 'platform:org:manage' }],
      } as never,
      createHttpClient: () => ({ get, post, put, patch: vi.fn(), delete: del }) as never,
    });
  });

  afterEach(() => {
    __resetPlatformRuntimeForTest();
    vi.restoreAllMocks();
  });

  it('renders departments as a two-level tree with manager names', async () => {
    mockReady();
    render(<OrganizationPage />);

    expect(screen.getByText('加载中…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('组织架构')).toBeInTheDocument());
    expect(screen.getByText('组织管理')).toBeInTheDocument();
    expect(screen.getByText('本期展示顶层与直接子部门。', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText('总部')[0]).toBeInTheDocument();
    expect(screen.getByText('└ 研发部')).toBeInTheDocument();
    expect(screen.getAllByText('张伟')[0]).toBeInTheDocument();
    expect(within(screen.getByLabelText('上级部门')).getByRole('option', { name: '总部' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('上级部门')).queryByRole('option', { name: '研发部' })).not.toBeInTheDocument();
  });

  it('hides mutation controls without platform org manage permission', async () => {
    __resetPlatformRuntimeForTest();
    setPlatformRuntime({
      currentUser: {
        id: 'viewer',
        enterpriseId: 'ent-default',
        permissions: [{ code: 'platform:org:view' }],
      } as never,
      createHttpClient: () => ({ get, post, put, patch: vi.fn(), delete: del }) as never,
    });
    mockReady();

    render(<OrganizationPage />);

    await screen.findByText('总部');
    expect(screen.queryByRole('button', { name: '保存部门' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
    expect(screen.getByText('只读模式')).toBeInTheDocument();
  });

  it('creates and updates departments through the platform API', async () => {
    mockReady();
    post.mockResolvedValueOnce(department({ id: 'dept-new', code: 'OPS', name: '运营部' }));
    put.mockResolvedValueOnce(department({ id: 'dept-child', name: '产品研发部' }));
    render(<OrganizationPage />);

    await userEvent.type(await screen.findByLabelText('部门编码'), 'OPS');
    await userEvent.type(screen.getByLabelText('部门名称'), '运营部');
    await userEvent.selectOptions(screen.getByLabelText('上级部门'), 'dept-root');
    await userEvent.click(screen.getByRole('button', { name: '保存部门' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('departments', {
        code: 'OPS',
        name: '运营部',
        parentId: 'dept-root',
        managerUserId: undefined,
        sortOrder: 100,
      }),
    );

    await waitFor(() => expect(get).toHaveBeenCalledTimes(4));
    const row = screen.getByText('└ 研发部').closest('tr') as HTMLTableRowElement;
    await userEvent.click(within(row).getByRole('button', { name: '编辑' }));
    await userEvent.clear(screen.getByLabelText('部门名称'));
    await userEvent.type(screen.getByLabelText('部门名称'), '产品研发部');
    await userEvent.click(screen.getByRole('button', { name: '保存部门' }));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('departments/dept-child', {
        name: '产品研发部',
        parentId: 'dept-root',
        managerUserId: 'employee-manager',
        sortOrder: 10,
      }),
    );
  });

  it('shows the backend occupancy message when deletion is rejected', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockReady();
    del.mockRejectedValueOnce(new Error('部门下仍有人员或子部门，无法删除'));
    render(<OrganizationPage />);

    await screen.findAllByText('总部');
    const row = screen.getAllByText('总部')[0].closest('tr') as HTMLTableRowElement;
    await userEvent.click(within(row).getByRole('button', { name: '删除' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('departments/dept-root'));
    expect(screen.getByText('部门下仍有人员或子部门，无法删除')).toBeInTheDocument();
  });

  function mockReady() {
    get.mockImplementation((url: string) => {
      if (url === 'departments') {
        return Promise.resolve({ items: departments() });
      }
      if (url === 'employees') {
        return Promise.resolve({ items: employees() });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
  }
});

function departments(): DepartmentDto[] {
  return [
    department({ id: 'dept-root', code: 'HQ', name: '总部', sortOrder: 1 }),
    department({
      id: 'dept-child',
      code: 'RD',
      name: '研发部',
      parentId: 'dept-root',
      managerUserId: 'employee-manager',
      sortOrder: 10,
    }),
  ];
}

function department(overrides: Partial<DepartmentDto> = {}): DepartmentDto {
  return {
    id: 'dept-1',
    enterpriseId: 'ent-default',
    code: 'DEPT',
    name: '部门',
    sortOrder: 100,
    status: 'active',
    ...overrides,
  };
}

function employees(): EmployeeDto[] {
  return [
    {
      id: 'employee-manager',
      enterpriseId: 'ent-default',
      employeeNo: '000001',
      account: 'zhangwei',
      name: '张伟',
      status: 'active',
      roleIds: [],
      mustChangePassword: false,
    },
  ];
}
