import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CurrentUserDto } from '@work/platform-contract';
import type { PresenceStatusRecordDto, PresenceStatusTypeDto } from '@work/presence-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPresenceRuntimeForTest, setPresenceRuntime } from '../runtime';
import RegisterStatusPage from './RegisterStatusPage';

function statusType(overrides: Partial<PresenceStatusTypeDto> = {}): PresenceStatusTypeDto {
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

const currentUser: CurrentUserDto = {
  id: 'user-001',
  account: 'alice',
  employeeNo: 'E001',
  name: 'Alice',
  enterpriseId: 'enterprise-001',
  departmentId: 'department-001',
  departmentName: '运营',
  roles: [],
  permissions: [],
  dataScopes: { profile: [], presence: [], report: [] },
  mustChangePassword: false,
};

describe('RegisterStatusPage', () => {
  const get = vi.fn();
  const post = vi.fn();
  const del = vi.fn();

  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    del.mockReset();
    setPresenceRuntime({
      currentUser,
      createHttpClient: () => ({ get, post, patch: vi.fn(), put: vi.fn(), delete: del }) as never,
    });
  });

  afterEach(() => {
    cleanup();
    __resetPresenceRuntimeForTest();
  });

  it('uses active non-default dictionary entries and displays cached current-user information', async () => {
    mockGet({ fields: [] });

    render(<RegisterStatusPage />);

    expect(await screen.findByLabelText('状态')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '出差' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '在岗' })).not.toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('E001')).toBeInTheDocument();
    expect(screen.getByText('运营')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining('employees/me'));
  });

  it('hides the department row when the runtime user has no department name', async () => {
    mockGet({ fields: [] });
    setPresenceRuntime({
      currentUser: { ...currentUser, departmentName: undefined },
      createHttpClient: () => ({ get, post, patch: vi.fn(), put: vi.fn(), delete: del }) as never,
    });

    render(<RegisterStatusPage />);

    await screen.findByLabelText('状态');
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('E001')).toBeInTheDocument();
    expect(screen.queryByText('部门')).not.toBeInTheDocument();
  });

  it('submits only filled dynamic values with the definition revision', async () => {
    mockGet({
      revision: 7,
      fields: [
        { fieldKey: 'reason', label: '事由', fieldType: 'text', required: true, sortOrder: 1, status: 'active' },
        { fieldKey: 'days', label: '天数', fieldType: 'number', required: false, sortOrder: 2, status: 'active' },
      ],
    });
    post.mockResolvedValue(mineRecord());

    render(<RegisterStatusPage />);

    await screen.findByLabelText('事由');
    await userEvent.click(screen.getByRole('button', { name: '提交登记' }));
    expect(screen.getByText('请填写事由')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('开始时间'), { target: { value: '2026-05-26T01:00' } });
    fireEvent.change(screen.getByLabelText('事由'), { target: { value: '客户拜访' } });
    await userEvent.click(screen.getByRole('button', { name: '提交登记' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('status-records', expect.any(Object)));
    expect(post.mock.calls[0][1]).toMatchObject({
      status: 'business_trip',
      form: { definitionRevision: 7, values: [{ fieldKey: 'reason', value: '客户拜访' }] },
    });
  });

  it('submits base status data without form when the selected status has no active fields', async () => {
    mockGet({ revision: 0, fields: [] });
    post.mockResolvedValue(mineRecord());

    render(<RegisterStatusPage />);
    await screen.findByLabelText('状态');
    fireEvent.change(screen.getByLabelText('开始时间'), { target: { value: '2026-05-26T01:00' } });
    await userEvent.click(screen.getByRole('button', { name: '提交登记' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).not.toHaveProperty('form');
  });

  it('blocks submission when the required start time is empty', async () => {
    mockGet({ revision: 0, fields: [] });

    render(<RegisterStatusPage />);
    await screen.findByLabelText('状态');
    await userEvent.click(screen.getByRole('button', { name: '提交登记' }));

    expect(screen.getByText('请填写开始时间')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('allows base submission when the forms definition cannot be loaded', async () => {
    get.mockImplementation((url: string) => {
      if (url === 'status-types') return Promise.resolve(statusTypes());
      if (url === 'status-records/mine') return Promise.resolve({ items: [] });
      if (url === 'definitions/presence.status.business_trip') return Promise.reject(new Error('forbidden'));
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
    post.mockResolvedValue(mineRecord());

    render(<RegisterStatusPage />);

    expect(await screen.findByText('未能读取填报模板，仅提交基础信息')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('开始时间'), { target: { value: '2026-05-26T01:00' } });
    await userEvent.click(screen.getByRole('button', { name: '提交登记' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).not.toHaveProperty('form');
  });

  it('blocks submission when the selected template has an unsupported required field', async () => {
    mockGet({
      revision: 8,
      fields: [
        { fieldKey: 'receipt', label: '凭证', fieldType: 'file', required: true, sortOrder: 1, status: 'active' },
      ],
    });

    render(<RegisterStatusPage />);

    expect(await screen.findByText('该状态的填报模板包含暂不支持的字段，请联系管理员调整')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交登记' })).toBeDisabled();
  });

  it('uses dictionary labels for history, falls back to archived keys, and preserves cancel', async () => {
    get.mockImplementation((url: string) => {
      if (url === 'status-types') return Promise.resolve(statusTypes());
      if (url === 'status-records/mine') {
        return Promise.resolve({ items: [mineRecord(), mineRecord({ id: 'record-002', status: 'archived_visit' })] });
      }
      if (url === 'definitions/presence.status.business_trip') return Promise.resolve({ revision: 0, fields: [] });
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
    del.mockResolvedValue(mineRecord({ cancelledAt: '2026-05-26T02:00:00.000Z' }));

    render(<RegisterStatusPage />);

    expect((await screen.findAllByText('出差')).length).toBeGreaterThan(1);
    expect(screen.getByText('archived_visit')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: '取消' })[0]);
    await waitFor(() => expect(del).toHaveBeenCalledWith('status-records/record-001'));
  });

  function mockGet(definition: unknown) {
    get.mockImplementation((url: string) => {
      if (url === 'status-types') return Promise.resolve(statusTypes());
      if (url === 'status-records/mine') return Promise.resolve({ items: [] });
      if (url === 'definitions/presence.status.business_trip') return Promise.resolve(definition);
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
  }
});

function statusTypes(): PresenceStatusTypeDto[] {
  return [
    statusType({ id: 'status-working', key: 'working', label: '在岗', isDefault: true, sortOrder: 10 }),
    statusType(),
  ];
}
