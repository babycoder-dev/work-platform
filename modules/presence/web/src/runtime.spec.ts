import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetPresenceRuntimeForTest,
  getPresenceFormsMirror,
  setPresenceRuntime,
} from './runtime';

describe('presence runtime', () => {
  afterEach(() => {
    __resetPresenceRuntimeForTest();
  });

  it('creates the forms mirror with its own forms API base URL', async () => {
    const createHttpClient = vi.fn(() => ({ get: vi.fn().mockResolvedValue({ revision: 0, fields: [] }) }));
    setPresenceRuntime({ currentUser: { id: 'user-001' } as never, createHttpClient } as never);

    await getPresenceFormsMirror().getPresenceStatusDefinition('business_trip');

    expect(createHttpClient).toHaveBeenCalledWith({ baseUrl: '/api/presence/' });
    expect(createHttpClient).toHaveBeenCalledWith({ baseUrl: '/api/forms/' });
  });
});
