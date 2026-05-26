import type { WorkWebModule, WorkWebModuleRuntime } from '@work/platform-sdk';
import { presenceManifest, presencePermissions } from '@work/presence-contract';
import { setPresenceRuntime } from './runtime';

export const presenceWebModule: WorkWebModule = {
  manifest: presenceManifest,
  setRuntime(runtime: WorkWebModuleRuntime) {
    setPresenceRuntime(runtime);
  },
  routes: [
    {
      path: '/presence/board',
      permission: presencePermissions.boardView,
      load: () => import('./pages/PresenceBoardPage'),
    },
    {
      path: '/presence/register',
      permission: presencePermissions.statusCreate,
      load: () => import('./pages/RegisterStatusPage'),
    },
  ],
};
