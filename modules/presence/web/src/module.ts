import type { WorkWebModule } from '@work/platform-sdk';
import { presenceManifest } from '@work/presence-contract';

export const presenceWebModule: WorkWebModule = {
  manifest: presenceManifest,
  routes: [
    {
      path: '/presence/board',
      permission: 'presence:board:view',
      load: () => import('./pages/PresenceBoardPage'),
    },
    {
      path: '/presence/register',
      permission: 'presence:status:create',
      load: () => import('./pages/RegisterStatusPage'),
    },
  ],
};
