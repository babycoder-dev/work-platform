import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TriggerConfigDto } from '@work/notification-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNotificationRuntimeForTest, setNotificationRuntime } from '../runtime';
import TriggerConfigPage from './TriggerConfigPage';

const get = vi.fn();
const put = vi.fn();

const config: TriggerConfigDto = {
  triggerKey: 'presence.status.changed',
  enabled: true,
  defaultRecipients: [{ kind: 'department_manager' }],
  updatedAt: '2026-06-16T00:00:00.000Z',
};

describe('TriggerConfigPage', () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
    setNotificationRuntime({
      currentUser: {
        id: 'user-001',
        enterpriseId: 'ent-default',
        permissions: [{ code: 'notification:trigger-config:manage' }],
      } as never,
      createHttpClient: () => ({ get, put, post: vi.fn(), patch: vi.fn(), delete: vi.fn(), stream: vi.fn() }) as never,
    });
  });

  afterEach(() => {
    __resetNotificationRuntimeForTest();
  });

  it('lists trigger configs and saves enabled and recipient changes', async () => {
    get.mockResolvedValueOnce({ items: [config] });
    put.mockResolvedValueOnce({ ...config, enabled: false });
    render(<TriggerConfigPage />);

    await screen.findByText('在位状态变更');
    expect(screen.getAllByText('部门负责人').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('checkbox', { name: /已启用/ }));
    await userEvent.selectOptions(screen.getByLabelText('接收人类型'), 'role');
    await userEvent.type(screen.getByLabelText('角色 code'), 'hr');
    await userEvent.click(screen.getByRole('button', { name: '添加接收人' }));
    expect(screen.getByText('角色：hr')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('trigger-config/presence.status.changed', {
        enabled: false,
        defaultRecipients: [{ kind: 'department_manager' }, { kind: 'role', roleCode: 'hr' }],
      }),
    );
  });

  it('removes editable recipients before saving', async () => {
    get.mockResolvedValueOnce({ items: [{ ...config, defaultRecipients: [{ kind: 'department_manager' }, { kind: 'role', roleCode: 'hr' }] }] });
    put.mockResolvedValueOnce(config);
    render(<TriggerConfigPage />);

    await screen.findByText('角色：hr');
    await userEvent.click(screen.getByRole('button', { name: '删除接收人 角色：hr' }));
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('trigger-config/presence.status.changed', {
        enabled: true,
        defaultRecipients: [{ kind: 'department_manager' }],
      }),
    );
  });

  it('renders load failure', async () => {
    get.mockRejectedValueOnce(new Error('配置加载失败'));
    render(<TriggerConfigPage />);
    await screen.findByText('配置加载失败');
  });

  it('renders read-only controls without manage permission', async () => {
    __resetNotificationRuntimeForTest();
    get.mockResolvedValueOnce({ items: [config] });
    setNotificationRuntime({
      currentUser: { id: 'user-001', enterpriseId: 'ent-default', permissions: [] } as never,
      createHttpClient: () => ({ get, put, post: vi.fn(), patch: vi.fn(), delete: vi.fn(), stream: vi.fn() }) as never,
    });

    render(<TriggerConfigPage />);
    await screen.findByText('在位状态变更');
    expect(screen.getByText('当前账号没有写权限，配置以只读方式展示。')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /已启用/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '添加接收人' })).not.toBeInTheDocument();
  });

  it('renders empty state', async () => {
    get.mockResolvedValueOnce({ items: [] });
    render(<TriggerConfigPage />);
    await screen.findByText('暂无触发点');
    expect(within(screen.getByText('暂无触发点').closest('section') as HTMLElement).getByText(/后端尚未 seed/)).toBeInTheDocument();
  });
});
