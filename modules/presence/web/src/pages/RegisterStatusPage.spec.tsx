import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PresenceStatusRecordDto } from '@work/presence-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPresenceRuntimeForTest, setPresenceRuntime } from '../runtime';
import RegisterStatusPage from './RegisterStatusPage';

function mineRecord(overrides: Partial<PresenceStatusRecordDto> = {}): PresenceStatusRecordDto {
  return {
    id: 'record-001',
    enterpriseId: 'enterprise-001',
    userId: 'user-001',
    employeeNo: 'E001',
    userName: 'Alice',
    departmentId: 'department-001',
    departmentName: '运营',
    status: 'business_trip',
    startAt: '2026-05-26T01:00:00.000Z',
    createdBy: 'user-001',
    createdAt: '2026-05-26T00:00:00.000Z',
    ...overrides,
  };
}

describe('RegisterStatusPage', () => {
  const get = vi.fn();
  const post = vi.fn();
  const del = vi.fn();

  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    del.mockReset();
    setPresenceRuntime({
      currentUser: { id: 'user-001' } as never,
      createHttpClient: () => ({ get, post, put: vi.fn(), delete: del }) as never,
    });
  });

  afterEach(() => {
    __resetPresenceRuntimeForTest();
  });

  it('submits the form and reloads mine list', async () => {
    get.mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({ items: [mineRecord()] });
    post.mockResolvedValueOnce(mineRecord());
    render(<RegisterStatusPage />);
    await waitFor(() => expect(screen.getByText('暂无记录。')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('开始时间'), { target: { value: '2026-05-26T01:00' } });
    await userEvent.click(screen.getByRole('button', { name: '提交登记' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe('status-records');
    const body = post.mock.calls[0][1] as { status: string; startAt: string };
    expect(body.status).toBe('business_trip');
    expect(new Date(body.startAt).toISOString()).toBe(body.startAt);

    await waitFor(() => expect(screen.getAllByText('出差').length).toBeGreaterThan(1));
  });

  it('cancels an active record', async () => {
    get.mockResolvedValueOnce({ items: [mineRecord()] }).mockResolvedValueOnce({
      items: [mineRecord({ cancelledAt: '2026-05-26T02:00:00.000Z' })],
    });
    del.mockResolvedValueOnce(mineRecord({ cancelledAt: '2026-05-26T02:00:00.000Z' }));
    render(<RegisterStatusPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('status-records/record-001'));
    await waitFor(() => expect(screen.getByText('（已取消）')).toBeInTheDocument());
  });

  it('shows error when submit fails', async () => {
    get.mockResolvedValueOnce({ items: [] });
    post.mockRejectedValueOnce(new Error('boom'));
    render(<RegisterStatusPage />);
    await waitFor(() => expect(screen.getByText('暂无记录。')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('开始时间'), { target: { value: '2026-05-26T01:00' } });
    await userEvent.click(screen.getByRole('button', { name: '提交登记' }));
    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
  });

  it('does not show cancel button on already cancelled records', async () => {
    get.mockResolvedValueOnce({ items: [mineRecord({ cancelledAt: '2026-05-26T02:00:00.000Z' })] });
    render(<RegisterStatusPage />);
    await waitFor(() => expect(screen.getByText('（已取消）')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '取消' })).not.toBeInTheDocument();
  });
});
