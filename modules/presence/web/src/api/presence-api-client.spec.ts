import type { HttpClient } from '@work/http-client';
import { describe, expect, it, vi } from 'vitest';
import { createPresenceApiClient } from './presence-api-client';

describe('createPresenceApiClient', () => {
  function makeHttp(): HttpClient & { calls: Array<{ method: string; url: string; body?: unknown }> } {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    return {
      calls,
      get: vi.fn(async (url: string) => {
        calls.push({ method: 'GET', url });
        return [];
      }),
      post: vi.fn(async (url: string, body?: unknown) => {
        calls.push({ method: 'POST', url, body });
        return { id: 'record-001' };
      }),
      put: vi.fn(),
      delete: vi.fn(async (url: string) => {
        calls.push({ method: 'DELETE', url });
        return { id: 'record-001' };
      }),
    } as never;
  }

  it('getBoard hits GET board and unwraps array', async () => {
    const http = makeHttp();
    const api = createPresenceApiClient(http);
    await api.getBoard();
    expect(http.calls).toEqual([{ method: 'GET', url: 'board' }]);
  });

  it('listMyRecords hits GET status-records/mine', async () => {
    const http = makeHttp();
    const api = createPresenceApiClient(http);
    await api.listMyRecords();
    expect(http.calls).toEqual([{ method: 'GET', url: 'status-records/mine' }]);
  });

  it('createRecord posts to status-records with body', async () => {
    const http = makeHttp();
    const api = createPresenceApiClient(http);
    const input = { status: 'business_trip', startAt: '2026-05-26T01:00:00.000Z' } as const;
    await api.createRecord(input);
    expect(http.calls).toEqual([{ method: 'POST', url: 'status-records', body: input }]);
  });

  it('cancelRecord deletes status-records/:id with encoded id', async () => {
    const http = makeHttp();
    const api = createPresenceApiClient(http);
    await api.cancelRecord('weird id&id');
    expect(http.calls).toEqual([{ method: 'DELETE', url: 'status-records/weird%20id%26id' }]);
  });
});
