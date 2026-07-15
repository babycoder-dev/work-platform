import type { HttpClient } from '@work/http-client';
import { describe, expect, it, vi } from 'vitest';
import { createPresenceFormsMirror } from './forms-mirror';

describe('createPresenceFormsMirror', () => {
  it('gets a presence status definition by encoded status key', async () => {
    const get = vi.fn().mockResolvedValue({ revision: 3, fields: [] });
    const http = { get } as unknown as HttpClient;

    await expect(
      createPresenceFormsMirror(http).getPresenceStatusDefinition('client visit&travel'),
    ).resolves.toEqual({ revision: 3, fields: [] });

    expect(get).toHaveBeenCalledWith('definitions/presence.status.client%20visit%26travel');
  });
});
