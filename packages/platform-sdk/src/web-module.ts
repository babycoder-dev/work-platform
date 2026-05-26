import type { CurrentUserDto } from '@work/platform-contract';
import type { HttpClient } from '@work/http-client';
import type { WorkModuleManifest } from './module-manifest';
import type { PlatformSDK } from './platform-sdk';

export interface WorkWebModuleRoute {
  path: string;
  permission?: string;
  load: () => Promise<{ default: unknown }>;
}

export interface WorkWebModuleRuntime {
  currentUser: CurrentUserDto;
  createHttpClient(options: { baseUrl: string }): HttpClient;
}

export interface WorkWebModule {
  manifest: WorkModuleManifest;
  routes: WorkWebModuleRoute[];
  setRuntime?(runtime: WorkWebModuleRuntime): void;
  setup?(platform: PlatformSDK): void | Promise<void>;
}
