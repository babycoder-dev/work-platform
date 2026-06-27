import type { HttpClient } from '@work/http-client';
import { describe, expect, it, vi } from 'vitest';
import { createPresenceApiClient } from './presence-api-client';

describe('createPresenceApiClient', () => {
  function makeHttp(): HttpClient & {
    calls: Array<{ method: string; url: string }>;
  } {
    const calls: Array<{ method: string; url: string }> = [];
    return {
      calls,
      get: vi.fn(async (url: string) => {
        calls.push({ method: 'GET', url });
        return { record: null };
      }),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as never;
  }

  it('gets current presence by encoded employee id', async () => {
    const http = makeHttp();
    const result = await createPresenceApiClient(http).getEmployeePresence('employee id&id');

    expect(result).toEqual({ record: null });
    expect(http.calls).toEqual([
      { method: 'GET', url: 'status-records/by-employee/employee%20id%26id' },
    ]);
  });
});
