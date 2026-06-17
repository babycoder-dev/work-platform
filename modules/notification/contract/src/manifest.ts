import type { WorkModuleManifest } from '@work/platform-sdk';
import { notificationPermissions } from './permissions';

export const notificationManifest: WorkModuleManifest = {
  name: 'notification',
  title: '通知中心',
  basePath: '/notification',
  apiPrefix: '/api/notification',
  menus: [
    {
      title: '通知设置',
      path: '/notification/trigger-config',
      permission: notificationPermissions.triggerConfigManage,
    },
  ],
  permissions: [
    {
      code: notificationPermissions.triggerConfigManage,
      name: '管理通知触发点配置',
    },
  ],
  routes: [
    {
      path: '/notification/trigger-config',
      permission: notificationPermissions.triggerConfigManage,
    },
  ],
};
