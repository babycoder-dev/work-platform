import type { CurrentUserDto } from '@work/platform-contract';
import type { WorkWebModuleRuntime } from '@work/platform-sdk';
import {
  createPlatformRolesApiClient,
  type PlatformRolesApiClient,
} from './api/platform-roles-api-client';

let cachedApi: PlatformRolesApiClient | undefined;
let cachedCurrentUser: CurrentUserDto | undefined;

export function setPlatformRuntime(runtime: WorkWebModuleRuntime): void {
  const http = runtime.createHttpClient({ baseUrl: '/api/platform/' });
  cachedApi = createPlatformRolesApiClient(http);
  cachedCurrentUser = runtime.currentUser;
}

export function getPlatformRolesApi(): PlatformRolesApiClient {
  if (!cachedApi) {
    throw new Error('Platform runtime not initialised. setRuntime must be called by the shell first.');
  }
  return cachedApi;
}

export function getPlatformCurrentUser(): CurrentUserDto {
  if (!cachedCurrentUser) {
    throw new Error('Platform runtime not initialised.');
  }
  return cachedCurrentUser;
}

export function __resetPlatformRuntimeForTest(): void {
  cachedApi = undefined;
  cachedCurrentUser = undefined;
}
