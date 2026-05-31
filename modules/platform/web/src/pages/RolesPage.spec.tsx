import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RoleDto } from '@work/platform-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPlatformRuntimeForTest, setPlatformRuntime } from '../runtime';
import RolesPage from './RolesPage';

function role(overrides: Partial<RoleDto> = {}): RoleDto {
  return {
    id: 'role-001',
    enterpriseId: 'enterprise-001',
    code: 'leader',
    name: '部门负责人',
    permissionCodes: [],
    dataScopes: [],
    isSystem: false,
    status: 'active',
    ...overrides,
  };
}

describe('RolesPage', () => {
  const get = vi.fn();
  const patch = vi.fn();
  const put = vi.fn();
  const del = vi.fn();

  beforeEach(() => {
    get.mockReset();
    patch.mockReset();
    put.mockReset();
    del.mockReset();
    setPlatformRuntime({
      currentUser: {
        id: 'user-001',
        enterpriseId: 'enterprise-001',
        permissions: [{ code: 'platform:role:manage' }, { code: 'platform:role:assign' }],
      } as never,
      createHttpClient: () => ({ get, post: vi.fn(), patch, put, delete: del }) as never,
    });
  });

  afterEach(() => {
    __resetPlatformRuntimeForTest();
    vi.restoreAllMocks();
  });

  it('renders loading then roles table', async () => {
    get.mockResolvedValueOnce({ items: [role()] });
    render(<RolesPage />);
    expect(screen.getByText('加载中…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('leader')).toBeInTheDocument());
    expect(screen.getAllByText('部门负责人')).toHaveLength(2);
  });

  it('renders empty state', async () => {
    get.mockResolvedValueOnce({ items: [] });
    render(<RolesPage />);
    await waitFor(() => expect(screen.getByText('暂无角色。')).toBeInTheDocument());
  });

  it('renders load failure', async () => {
    get.mockRejectedValueOnce(new Error('列表失败'));
    render(<RolesPage />);
    await waitFor(() => expect(screen.getByText('列表失败')).toBeInTheDocument());
  });

  it('disables edit and delete for system roles', async () => {
    get.mockResolvedValueOnce({ items: [role({ isSystem: true, name: '系统管理员' })] });
    render(<RolesPage />);
    await screen.findByText('leader');
    const row = screen.getAllByText('系统管理员')[0];
    const buttons = within(row.closest('tr') as HTMLTableRowElement).getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
    expect(screen.getByText('内置')).toBeInTheDocument();
  });

  it('shows backend message when deletion fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    get.mockResolvedValueOnce({ items: [role()] });
    del.mockRejectedValueOnce(new Error('角色仍被用户使用，请先解除分配'));
    render(<RolesPage />);
    await userEvent.click(await screen.findByRole('button', { name: '删除' }));
    await waitFor(() => expect(screen.getByText('角色仍被用户使用，请先解除分配')).toBeInTheDocument());
  });

  it('assigns selected roles to an employee id', async () => {
    get.mockResolvedValueOnce({ items: [role()] });
    put.mockResolvedValueOnce({});
    render(<RolesPage />);
    await screen.findByText('leader');
    await userEvent.type(screen.getByLabelText('员工 ID'), 'employee-001');
    await userEvent.click(screen.getByRole('checkbox', { name: '部门负责人' }));
    await userEvent.click(screen.getByRole('button', { name: '保存员工角色' }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('employees/employee-001/roles', { roleIds: ['role-001'] }),
    );
    expect(screen.getByText('员工角色已更新。')).toBeInTheDocument();
  });

  it('hides mutation controls without manage or assign permissions', async () => {
    __resetPlatformRuntimeForTest();
    setPlatformRuntime({
      currentUser: { id: 'user-001', enterpriseId: 'enterprise-001', permissions: [] } as never,
      createHttpClient: () => ({ get, post: vi.fn(), patch, put, delete: del }) as never,
    });
    get.mockResolvedValueOnce({ items: [role()] });
    render(<RolesPage />);
    await screen.findByText('leader');
    expect(screen.queryByRole('button', { name: '新建角色' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
    expect(screen.queryByText('给员工分配角色')).not.toBeInTheDocument();
    expect(screen.getByText('只读')).toBeInTheDocument();
  });
});
