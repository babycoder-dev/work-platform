import type { CurrentUserDto } from '@work/platform-contract';
import type { WorkWebModuleRuntime } from '@work/platform-sdk';
import {
  createPlatformRolesApiClient,
  type PlatformRolesApiClient,
} from './api/platform-roles-api-client';
import { createFormsApiClient, type FormsApiClient } from './api/forms-api-client';
import { createPresenceApiClient, type PresenceApiClient } from './api/presence-api-client';

let cachedApi: PlatformRolesApiClient | undefined;
let cachedFormsApi: FormsApiClient | undefined;
let cachedPresenceApi: PresenceApiClient | undefined;
let cachedCurrentUser: CurrentUserDto | undefined;

export function setPlatformRuntime(runtime: WorkWebModuleRuntime): void {
  cachedApi = createPlatformRolesApiClient(runtime.createHttpClient({ baseUrl: '/api/platform/' }));
  cachedFormsApi = createFormsApiClient(runtime.createHttpClient({ baseUrl: '/api/forms/' }));
  cachedPresenceApi = createPresenceApiClient(
    runtime.createHttpClient({ baseUrl: '/api/presence/' }),
  );
  cachedCurrentUser = runtime.currentUser;
}

export function getPlatformRolesApi(): PlatformRolesApiClient {
  if (!cachedApi) {
    throw new Error(
      'Platform runtime not initialised. setRuntime must be called by the shell first.',
    );
  }
  return cachedApi;
}

export function getPlatformCurrentUser(): CurrentUserDto {
  if (!cachedCurrentUser) {
    throw new Error('Platform runtime not initialised.');
  }
  return cachedCurrentUser;
}

export function getFormsApi(): FormsApiClient {
  if (!cachedFormsApi) {
    throw new Error(
      'Platform runtime not initialised. setRuntime must be called by the shell first.',
    );
  }
  return cachedFormsApi;
}

export function getPresenceApi(): PresenceApiClient {
  if (!cachedPresenceApi) {
    throw new Error(
      'Platform runtime not initialised. setRuntime must be called by the shell first.',
    );
  }
  return cachedPresenceApi;
}

export function __resetPlatformRuntimeForTest(): void {
  cachedApi = undefined;
  cachedFormsApi = undefined;
  cachedPresenceApi = undefined;
  cachedCurrentUser = undefined;
}
