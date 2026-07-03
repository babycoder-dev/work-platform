import type { ModuleManifestDto } from '@work/platform-contract';
import { presencePermissions } from './permissions';

export const PRESENCE_MODULE_MANIFEST_ID = '00000000-0000-0000-0000-000000000202';
export const PRESENCE_BOARD_MENU_ID = '00000000-0000-0000-0000-000000000104';
export const PRESENCE_REGISTER_MENU_ID = '00000000-0000-0000-0000-000000000105';

export const presencePlatformManifest: ModuleManifestDto = {
  id: PRESENCE_MODULE_MANIFEST_ID,
  moduleName: 'presence',
  displayName: '在位管理',
  description: '出差、外出调研、休假等在位状态登记与看板',
  apiPrefix: '/api/presence',
  webEntry: '/presence',
  status: 'active',
  permissions: [
    { code: presencePermissions.boardView, name: '查看在位看板', moduleName: 'presence' },
    { code: presencePermissions.statusCreate, name: '登记在位状态', moduleName: 'presence' },
    { code: presencePermissions.statusManage, name: '管理团队在位状态', moduleName: 'presence' },
    {
      code: presencePermissions.statusTypeManage,
      name: '管理在位状态字典',
      moduleName: 'presence',
    },
  ],
  menus: [
    {
      id: PRESENCE_BOARD_MENU_ID,
      moduleName: 'presence',
      title: '在位看板',
      path: '/presence/board',
      permissionCode: presencePermissions.boardView,
      sortOrder: 100,
      status: 'active',
    },
    {
      id: PRESENCE_REGISTER_MENU_ID,
      moduleName: 'presence',
      title: '状态登记',
      path: '/presence/register',
      permissionCode: presencePermissions.statusCreate,
      sortOrder: 110,
      status: 'active',
    },
  ],
};
