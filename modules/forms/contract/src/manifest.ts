import type { WorkModuleManifest } from '@work/platform-sdk';
import { formsPermissionDefinitions } from './permissions';

export const formsManifest: WorkModuleManifest = {
  name: 'forms',
  title: '动态表单',
  basePath: '/forms',
  apiPrefix: '/api/forms',
  menus: [],
  permissions: formsPermissionDefinitions,
  routes: [],
};
