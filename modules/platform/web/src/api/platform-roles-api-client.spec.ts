import type { HttpClient } from '@work/http-client';
import type { CreateRoleInput, UpdateRoleInput } from '@work/platform-contract';
import { describe, expect, it, vi } from 'vitest';
import { createPlatformRolesApiClient } from './platform-roles-api-client';

describe('createPlatformRolesApiClient', () => {
  function makeHttp(): HttpClient & { calls: Array<{ method: string; url: string; body?: unknown }> } {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    return {
      calls,
      get: vi.fn(async (url: string) => {
        calls.push({ method: 'GET', url });
        return { items: [{ id: 'role-001' }] };
      }),
      post: vi.fn(async (url: string, body?: unknown) => {
        calls.push({ method: 'POST', url, body });
        return { id: 'role-001' };
      }),
      patch: vi.fn(async (url: string, body?: unknown) => {
        calls.push({ method: 'PATCH', url, body });
        return { id: 'role-001' };
      }),
      put: vi.fn(async (url: string, body?: unknown) => {
        calls.push({ method: 'PUT', url, body });
        return {};
      }),
      delete: vi.fn(async (url: string) => {
        calls.push({ method: 'DELETE', url });
      }),
    } as never;
  }

  it('lists roles and unwraps items', async () => {
    const http = makeHttp();
    const roles = await createPlatformRolesApiClient(http).listRoles();
    expect(roles).toEqual([{ id: 'role-001' }]);
    expect(http.calls).toEqual([{ method: 'GET', url: 'roles' }]);
  });

  it('gets an encoded role id', async () => {
    const http = makeHttp();
    await createPlatformRolesApiClient(http).getRole('role id&id');
    expect(http.calls).toEqual([{ method: 'GET', url: 'roles/role%20id%26id' }]);
  });

  it('creates a role', async () => {
    const http = makeHttp();
    const input = { code: 'leader' } as CreateRoleInput;
    await createPlatformRolesApiClient(http).createRole(input);
    expect(http.calls).toEqual([{ method: 'POST', url: 'roles', body: input }]);
  });

  it('patches an encoded role id', async () => {
    const http = makeHttp();
    const input = { name: 'Leader' } satisfies UpdateRoleInput;
    await createPlatformRolesApiClient(http).updateRole('role id', input);
    expect(http.calls).toEqual([{ method: 'PATCH', url: 'roles/role%20id', body: input }]);
  });

  it('deletes an encoded role id', async () => {
    const http = makeHttp();
    await createPlatformRolesApiClient(http).deleteRole('role/id');
    expect(http.calls).toEqual([{ method: 'DELETE', url: 'roles/role%2Fid' }]);
  });

  it('lists permissions and unwraps items', async () => {
    const http = makeHttp();
    const permissions = await createPlatformRolesApiClient(http).listPermissions();
    expect(permissions).toEqual([{ id: 'role-001' }]);
    expect(http.calls).toEqual([{ method: 'GET', url: 'permissions' }]);
  });

  it('assigns only roleIds in the body', async () => {
    const http = makeHttp();
    await createPlatformRolesApiClient(http).assignUserRoles('user id&id', ['role-001']);
    expect(http.calls).toEqual([
      { method: 'PUT', url: 'employees/user%20id%26id/roles', body: { roleIds: ['role-001'] } },
    ]);
  });
});
