import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PresenceStatusTypeDto } from '@work/presence-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPresenceRuntimeForTest, setPresenceRuntime } from '../runtime';
import StatusTypesPage from './StatusTypesPage';

function type(overrides: Partial<PresenceStatusTypeDto> = {}): PresenceStatusTypeDto {
  return {
    id: 'status-business-trip',
    enterpriseId: 'enterprise-001',
    key: 'business_trip',
    label: '出差',
    isPreset: true,
    isDefault: false,
    status: 'active',
    sortOrder: 20,
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
    ...overrides,
  };
}

const types = [
  type({ id: 'status-working', key: 'working', label: '在岗', isDefault: true, sortOrder: 10 }),
  type(),
  type({ id: 'status-archived', key: 'client_visit', label: '客户拜访', isPreset: false, status: 'archived' }),
];

describe('StatusTypesPage', () => {
  const get = vi.fn();
  const post = vi.fn();
  const patch = vi.fn();

  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    patch.mockReset();
    get.mockResolvedValue(types);
    setPresenceRuntime({
      currentUser: { id: 'user-001' } as never,
      createHttpClient: () => ({ get, post, patch, put: vi.fn(), delete: vi.fn() }) as never,
    });
  });

  afterEach(() => {
    cleanup();
    __resetPresenceRuntimeForTest();
  });

  it('renders all status types with preset, default, and archived indicators', async () => {
    render(<StatusTypesPage />);

    expect(await screen.findByText('客户拜访')).toBeInTheDocument();
    expect(screen.getByText('working')).toBeInTheDocument();
    expect(screen.getAllByText('预置')).toHaveLength(3);
    expect(screen.getAllByText('缺省')).toHaveLength(2);
    expect(screen.getByText('已停用')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('status-types/all');
  });

  it('blocks invalid keys locally and creates a valid status type through the modal', async () => {
    post.mockResolvedValue(type({ key: 'client_visit', label: '客户拜访' }));
    render(<StatusTypesPage />);
    await screen.findByText('客户拜访');

    await userEvent.click(screen.getByRole('button', { name: '新建状态' }));
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'Bad-Key' } });
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '客户拜访' } });
    await userEvent.click(screen.getByRole('button', { name: '创建' }));
    expect(screen.getByText('key 仅可使用小写字母、数字和下划线')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'client_visit' } });
    await userEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('status-types', expect.any(Object)));
    expect(post.mock.calls[0][1]).toEqual({ key: 'client_visit', label: '客户拜访', sortOrder: 0 });
  });

  it('disables archiving the default type and restores archived types after confirmation', async () => {
    post.mockResolvedValue(type({ id: 'status-archived', status: 'active' }));
    render(<StatusTypesPage />);
    await screen.findByText('客户拜访');

    expect(screen.getAllByRole('button', { name: '停用' })[0]).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '恢复' }));
    await userEvent.click(screen.getByRole('button', { name: '恢复状态' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('status-types/status-archived/restore'));
  });

  it('edits and archives an active non-default type through its modal and confirmation', async () => {
    patch.mockResolvedValue(type({ label: '商务出差', sortOrder: 25 }));
    post.mockResolvedValue(type({ status: 'archived' }));
    render(<StatusTypesPage />);
    await screen.findByText('客户拜访');

    await userEvent.click(screen.getAllByRole('button', { name: '编辑' })[1]);
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '商务出差' } });
    fireEvent.change(screen.getByLabelText('排序'), { target: { value: '25' } });
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('status-types/status-business-trip', {
        label: '商务出差',
        sortOrder: 25,
      }),
    );

    await userEvent.click(screen.getAllByRole('button', { name: '停用' })[1]);
    await userEvent.click(screen.getByRole('button', { name: '停用状态' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('status-types/status-business-trip/archive'));
  });

  it('shows a rejected default change and refreshes the list', async () => {
    post.mockRejectedValueOnce(new Error('状态类型已被其他管理员更新'));
    render(<StatusTypesPage />);
    await screen.findByText('客户拜访');

    await userEvent.click(screen.getAllByRole('button', { name: '设为缺省' })[1]);
    await userEvent.click(screen.getByRole('button', { name: '设为缺省状态' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('status-types/status-business-trip/default'),
    );
    expect(await screen.findByText('状态类型已被其他管理员更新')).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});
