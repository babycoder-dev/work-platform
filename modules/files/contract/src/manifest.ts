import type { WorkModuleManifest } from '@work/platform-sdk';
import { filesPermissionDefinitions } from './permissions';

export const filesManifest: WorkModuleManifest = {
  name: 'files',
  title: '文件存储',
  basePath: '/files',
  apiPrefix: '/api/files',
  menus: [],
  permissions: filesPermissionDefinitions,
  routes: [],
};
