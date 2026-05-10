import type { WorkModuleManifest } from '@work/platform-sdk';
import { presencePermissionDefinitions, presencePermissions } from './permissions';

export const presenceManifest: WorkModuleManifest = {
  name: 'presence',
  title: '在位管理',
  basePath: '/presence',
  apiPrefix: '/api/presence',
  menus: [
    {
      title: '在位看板',
      path: '/presence/board',
      permission: presencePermissions.boardView,
    },
    {
      title: '状态登记',
      path: '/presence/register',
      permission: presencePermissions.statusCreate,
    },
  ],
  permissions: presencePermissionDefinitions,
  routes: [
    {
      path: '/presence/board',
      permission: presencePermissions.boardView,
    },
    {
      path: '/presence/register',
      permission: presencePermissions.statusCreate,
    },
  ],
};
