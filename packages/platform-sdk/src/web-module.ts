import type { WorkModuleManifest } from './module-manifest';
import type { PlatformSDK } from './platform-sdk';

export interface WorkWebModuleRoute {
  path: string;
  permission?: string;
  load: () => Promise<{ default: unknown }>;
}

export interface WorkWebModule {
  manifest: WorkModuleManifest;
  routes: WorkWebModuleRoute[];
  setup?(platform: PlatformSDK): void | Promise<void>;
}
