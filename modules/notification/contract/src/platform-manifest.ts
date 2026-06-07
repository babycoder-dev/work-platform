import type { ModuleManifestDto } from '@work/platform-contract';

export const NOTIFICATION_MODULE_MANIFEST_ID = '00000000-0000-0000-0000-000000000207';

export const notificationPlatformManifest: ModuleManifestDto = {
  id: NOTIFICATION_MODULE_MANIFEST_ID,
  moduleName: 'notification',
  displayName: '通知中心',
  description: '站内通知、触发点与调度配置的共享后端模块',
  apiPrefix: '/api/notification',
  status: 'active',
  permissions: [],
  menus: [],
};
