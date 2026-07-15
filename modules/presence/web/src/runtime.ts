import type { CurrentUserDto } from '@work/platform-contract';
import type { WorkWebModuleRuntime } from '@work/platform-sdk';
import { createPresenceFormsMirror, type PresenceFormsMirror } from './api/forms-mirror';
import { createPresenceApiClient, type PresenceApiClient } from './api/presence-api-client';

let cachedApi: PresenceApiClient | undefined;
let cachedFormsMirror: PresenceFormsMirror | undefined;
let cachedCurrentUser: CurrentUserDto | undefined;

export function setPresenceRuntime(runtime: WorkWebModuleRuntime): void {
  const http = runtime.createHttpClient({ baseUrl: '/api/presence/' });
  cachedApi = createPresenceApiClient(http);
  cachedFormsMirror = createPresenceFormsMirror(runtime.createHttpClient({ baseUrl: '/api/forms/' }));
  cachedCurrentUser = runtime.currentUser;
}

export function getPresenceApi(): PresenceApiClient {
  if (!cachedApi) {
    throw new Error('Presence runtime not initialised. setRuntime must be called by the shell first.');
  }
  return cachedApi;
}

export function getCurrentUser(): CurrentUserDto {
  if (!cachedCurrentUser) {
    throw new Error('Presence runtime not initialised.');
  }
  return cachedCurrentUser;
}

export function getPresenceFormsMirror(): PresenceFormsMirror {
  if (!cachedFormsMirror) {
    throw new Error('Presence runtime not initialised. setRuntime must be called by the shell first.');
  }
  return cachedFormsMirror;
}

export function __resetPresenceRuntimeForTest(): void {
  cachedApi = undefined;
  cachedFormsMirror = undefined;
  cachedCurrentUser = undefined;
}
