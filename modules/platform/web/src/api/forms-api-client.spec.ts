import type { HttpClient } from '@work/http-client';
import { describe, expect, it, vi } from 'vitest';
import { createFormsApiClient } from './forms-api-client';
import type { UpsertProfileRecordInput } from './forms-types';

describe('createFormsApiClient', () => {
  function makeHttp(): HttpClient & {
    calls: Array<{ method: string; url: string; body?: unknown }>;
  } {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    return {
      calls,
      get: vi.fn(async (url: string) => {
        calls.push({ method: 'GET', url });
        return { revision: 3, values: [] };
      }),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(async (url: string, body?: unknown) => {
        calls.push({ method: 'PUT', url, body });
        return { definitionRevision: 3, values: [] };
      }),
      delete: vi.fn(),
    } as never;
  }

  it('gets the profile.employee definition without unwrapping items', async () => {
    const http = makeHttp();
    const result = await createFormsApiClient(http).getProfileDefinition();

    expect(result).toEqual({ revision: 3, values: [] });
    expect(http.calls).toEqual([{ method: 'GET', url: 'definitions/profile.employee' }]);
  });

  it('gets a profile.employee record by encoded subject id', async () => {
    const http = makeHttp();
    await createFormsApiClient(http).getProfileRecord('employee id&id');

    expect(http.calls).toEqual([
      { method: 'GET', url: 'records/profile.employee/subjects/employee%20id%26id' },
    ]);
  });

  it('upserts a profile.employee record with definition revision and values', async () => {
    const http = makeHttp();
    const input = {
      definitionRevision: 3,
      values: [{ fieldKey: 'nickname', value: '阿伟' }],
    } satisfies UpsertProfileRecordInput;

    await createFormsApiClient(http).upsertProfileRecord('employee/id', input);

    expect(http.calls).toEqual([
      {
        method: 'PUT',
        url: 'records/profile.employee/subjects/employee%2Fid',
        body: input,
      },
    ]);
  });
});
