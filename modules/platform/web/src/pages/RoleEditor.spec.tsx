import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RoleDto } from '@work/platform-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPlatformRuntimeForTest, setPlatformRuntime } from '../runtime';
import { RoleEditor } from './RoleEditor';

function savedRole(): RoleDto {
  return {
    id: 'role-001',
    enterpriseId: 'enterprise-001',
    code: 'leader',
    name: '部门负责人',
    permissionCodes: [],
    dataScopes: [],
    isSystem: false,
    status: 'active',
  };
}

describe('RoleEditor', () => {
  const get = vi.fn();
  const post = vi.fn();

  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    setPlatformRuntime({
      currentUser: { id: 'user-001', enterpriseId: 'enterprise-001' } as never,
      createHttpClient: () => ({ get, post, patch: vi.fn(), put: vi.fn(), delete: vi.fn() }) as never,
    });
  });

  afterEach(() => {
    __resetPlatformRuntimeForTest();
  });

  it('renders three data types by four editable scopes and groups permissions', async () => {
    get.mockResolvedValueOnce({
      items: [
        { code: 'platform:role:view', name: '查看角色', moduleName: 'platform' },
        { code: 'presence:board:view', name: '查看在位看板', moduleName: 'presence' },
      ],
    });
    render(<RoleEditor onCancel={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByText('查看角色');
    expect(screen.getAllByRole('radio')).toHaveLength(12);
    expect(screen.getByText('个人信息档案')).toBeInTheDocument();
    expect(screen.getByText('在位状态')).toBeInTheDocument();
    expect(screen.getByText('日报周报')).toBeInTheDocument();
    expect(screen.queryByText('custom')).not.toBeInTheDocument();
    expect(screen.getByText('platform')).toBeInTheDocument();
    expect(screen.getByText('presence')).toBeInTheDocument();
  });

  it('submits explicit dataScopes for every platform data type', async () => {
    get.mockResolvedValueOnce({ items: [] });
    post.mockResolvedValueOnce(savedRole());
    const onSaved = vi.fn();
    render(<RoleEditor onCancel={vi.fn()} onSaved={onSaved} />);
    await screen.findByText('暂无权限点。');
    await userEvent.type(screen.getByLabelText('名称'), '部门负责人');
    await userEvent.type(screen.getByLabelText('code'), 'leader');
    await userEvent.click(screen.getByRole('radio', { name: '个人信息档案-本部门' }));
    await userEvent.click(screen.getByRole('radio', { name: '在位状态-全公司' }));
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]).toEqual([
      'roles',
      {
        enterpriseId: 'enterprise-001',
        code: 'leader',
        name: '部门负责人',
        description: undefined,
        permissionCodes: [],
        dataScopes: [
          { dataType: 'profile', scope: 'department' },
          { dataType: 'presence', scope: 'company' },
          { dataType: 'report', scope: 'self' },
        ],
      },
    ]);
    expect(onSaved).toHaveBeenCalledWith(savedRole());
  });

  it('shows save error', async () => {
    get.mockResolvedValueOnce({ items: [] });
    post.mockRejectedValueOnce(new Error('保存失败'));
    render(<RoleEditor onCancel={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByText('暂无权限点。');
    await userEvent.type(screen.getByLabelText('名称'), '部门负责人');
    await userEvent.type(screen.getByLabelText('code'), 'leader');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.getByText('保存失败')).toBeInTheDocument());
  });

  it('disables save when permissions fail to load', async () => {
    get.mockRejectedValueOnce(new Error('权限加载失败'));
    render(<RoleEditor onCancel={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByText('权限加载失败');
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });
});
