import type { HttpClient } from '@work/http-client';
import type {
  PresenceBoardEntryDto,
  PresenceStatusRecordDto,
  PresenceStatusTypeDto,
} from '@work/presence-contract';
import { describe, expect, it, vi } from 'vitest';
import { createPresenceApiClient } from './presence-api-client';

const boardEntry: PresenceBoardEntryDto = {
  userId: 'user-001',
  employeeNo: 'E001',
  userName: 'Alice',
  departmentId: 'department-001',
  departmentName: '运营',
  status: 'working',
  statusLabel: '在岗',
  isDefault: true,
};

const record: PresenceStatusRecordDto = {
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
};

const statusType: PresenceStatusTypeDto = {
  id: 'status-001',
  enterpriseId: 'enterprise-001',
  key: 'business_trip',
  label: '出差',
  isPreset: true,
  isDefault: false,
  status: 'active',
  sortOrder: 20,
  createdAt: '2026-05-26T00:00:00.000Z',
  updatedAt: '2026-05-26T00:00:00.000Z',
};

describe('createPresenceApiClient', () => {
  function makeHttp(): HttpClient & {
    calls: Array<{ method: string; url: string; body?: unknown }>;
  } {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    return {
      calls,
      get: vi.fn(async (url: string) => {
        calls.push({ method: 'GET', url });
        if (url === 'board') return { items: [boardEntry] };
        if (url === 'status-records/mine') return { items: [record] };
        return [statusType];
      }),
      post: vi.fn(async (url: string, body?: unknown) => {
        calls.push({ method: 'POST', url, body });
        return url === 'status-records' ? record : statusType;
      }),
      patch: vi.fn(async (url: string, body?: unknown) => {
        calls.push({ method: 'PATCH', url, body });
        return statusType;
      }),
      put: vi.fn(),
      delete: vi.fn(async (url: string) => {
        calls.push({ method: 'DELETE', url });
        return record;
      }),
    } as never;
  }

  it('gets board entries and unwraps items', async () => {
    const http = makeHttp();

    await expect(createPresenceApiClient(http).getBoard()).resolves.toEqual([boardEntry]);

    expect(http.calls).toEqual([{ method: 'GET', url: 'board' }]);
  });

  it('lists own records and unwraps items', async () => {
    const http = makeHttp();

    await expect(createPresenceApiClient(http).listMyRecords()).resolves.toEqual([record]);

    expect(http.calls).toEqual([{ method: 'GET', url: 'status-records/mine' }]);
  });

  it('lists active and all status types', async () => {
    const http = makeHttp();
    const api = createPresenceApiClient(http);

    await expect(api.listStatusTypes()).resolves.toEqual([statusType]);
    await expect(api.listAllStatusTypes()).resolves.toEqual([statusType]);

    expect(http.calls).toEqual([
      { method: 'GET', url: 'status-types' },
      { method: 'GET', url: 'status-types/all' },
    ]);
  });

  it('creates a status type', async () => {
    const http = makeHttp();
    const input = { key: 'client_visit', label: '客户拜访', sortOrder: 30 };

    await expect(createPresenceApiClient(http).createStatusType(input)).resolves.toEqual(statusType);

    expect(http.calls).toEqual([{ method: 'POST', url: 'status-types', body: input }]);
  });

  it('updates a status type', async () => {
    const http = makeHttp();
    const input = { label: '商务出差', sortOrder: 25 };

    await expect(createPresenceApiClient(http).updateStatusType('status id', input)).resolves.toEqual(
      statusType,
    );

    expect(http.calls).toEqual([
      { method: 'PATCH', url: 'status-types/status%20id', body: input },
    ]);
  });

  it('sets a status type as default', async () => {
    const http = makeHttp();

    await expect(createPresenceApiClient(http).setDefaultStatusType('status id')).resolves.toEqual(
      statusType,
    );

    expect(http.calls).toEqual([{ method: 'POST', url: 'status-types/status%20id/default' }]);
  });

  it('archives a status type', async () => {
    const http = makeHttp();

    await expect(createPresenceApiClient(http).archiveStatusType('status id')).resolves.toEqual(statusType);

    expect(http.calls).toEqual([{ method: 'POST', url: 'status-types/status%20id/archive' }]);
  });

  it('restores a status type', async () => {
    const http = makeHttp();

    await expect(createPresenceApiClient(http).restoreStatusType('status id')).resolves.toEqual(statusType);

    expect(http.calls).toEqual([{ method: 'POST', url: 'status-types/status%20id/restore' }]);
  });

  it('creates a status record with its request body', async () => {
    const http = makeHttp();
    const input = { status: 'business_trip', startAt: '2026-05-26T01:00:00.000Z' };

    await createPresenceApiClient(http).createRecord(input);

    expect(http.calls).toEqual([{ method: 'POST', url: 'status-records', body: input }]);
  });

  it('cancels a status record with an encoded id', async () => {
    const http = makeHttp();

    await createPresenceApiClient(http).cancelRecord('weird id&id');

    expect(http.calls).toEqual([{ method: 'DELETE', url: 'status-records/weird%20id%26id' }]);
  });
});
