import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PresenceStatusRecordDto } from '@work/presence-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPresenceRuntimeForTest, setPresenceRuntime } from '../runtime';
import PresenceBoardPage from './PresenceBoardPage';

function record(overrides: Partial<PresenceStatusRecordDto> = {}): PresenceStatusRecordDto {
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

// M9-3b: unskip after board client migrates to PresenceBoardEntryDto
describe.skip('PresenceBoardPage', () => {
  const getBoard = vi.fn();

  beforeEach(() => {
    getBoard.mockReset();
    setPresenceRuntime({
      currentUser: { id: 'user-001' } as never,
      createHttpClient: () =>
        ({ get: getBoard, post: vi.fn(), put: vi.fn(), delete: vi.fn() }) as never,
    });
  });

  afterEach(() => {
    __resetPresenceRuntimeForTest();
  });

  it('renders loading then list', async () => {
    getBoard.mockResolvedValueOnce({ items: [record()] });
    render(<PresenceBoardPage />);
    expect(screen.getByText('加载中…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.getByText('出差')).toBeInTheDocument();
  });

  it('renders empty state when no records', async () => {
    getBoard.mockResolvedValueOnce({ items: [] });
    render(<PresenceBoardPage />);
    await waitFor(() => expect(screen.getByText('当前没有进行中的在位记录。')).toBeInTheDocument());
  });

  it('renders error state on failure', async () => {
    getBoard.mockRejectedValueOnce(new Error('boom'));
    render(<PresenceBoardPage />);
    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
  });

  it('refresh button triggers reload', async () => {
    getBoard
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [record({ userName: 'Bob' })] });
    render(<PresenceBoardPage />);
    await waitFor(() => expect(screen.getByText('当前没有进行中的在位记录。')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '刷新' }));
    await waitFor(() => expect(screen.getByText('Bob')).toBeInTheDocument());
  });
});
