import type { WorkWebModule, WorkWebModuleRuntime } from '@work/platform-sdk';
import { notificationManifest, notificationPermissions } from '@work/notification-contract';
import { setNotificationRuntime } from './runtime';

export const notificationWebModule: WorkWebModule = {
  manifest: notificationManifest,
  setRuntime(runtime: WorkWebModuleRuntime) {
    setNotificationRuntime(runtime);
  },
  routes: [
    {
      path: '/notification/trigger-config',
      permission: notificationPermissions.triggerConfigManage,
      load: () => import('./pages/TriggerConfigPage'),
    },
  ],
};
