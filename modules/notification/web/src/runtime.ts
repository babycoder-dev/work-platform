import type { CurrentUserDto } from '@work/platform-contract';
import type { WorkWebModuleRuntime } from '@work/platform-sdk';
import {
  createNotificationTriggerConfigApiClient,
  type NotificationTriggerConfigApiClient,
} from './api/notification-trigger-config-api-client';

let cachedApi: NotificationTriggerConfigApiClient | undefined;
let cachedCurrentUser: CurrentUserDto | undefined;

export function setNotificationRuntime(runtime: WorkWebModuleRuntime): void {
  const http = runtime.createHttpClient({ baseUrl: '/api/notification/' });
  cachedApi = createNotificationTriggerConfigApiClient(http);
  cachedCurrentUser = runtime.currentUser;
}

export function getNotificationTriggerConfigApi(): NotificationTriggerConfigApiClient {
  if (!cachedApi) {
    throw new Error('Notification runtime not initialised. setRuntime must be called by the shell first.');
  }
  return cachedApi;
}

export function getNotificationCurrentUser(): CurrentUserDto {
  if (!cachedCurrentUser) {
    throw new Error('Notification runtime not initialised.');
  }
  return cachedCurrentUser;
}

export function __resetNotificationRuntimeForTest(): void {
  cachedApi = undefined;
  cachedCurrentUser = undefined;
}
