import type { ModuleManifestDto } from '@work/platform-contract';
import { filesPermissions } from './permissions';

export const FILES_MODULE_MANIFEST_ID = '00000000-0000-0000-0000-000000000206';

export const filesPlatformManifest: ModuleManifestDto = {
  id: FILES_MODULE_MANIFEST_ID,
  moduleName: 'files',
  displayName: '文件存储',
  description: '表单附件、档案照片等私有文件对象元数据与引用基建',
  apiPrefix: '/api/files',
  status: 'active',
  permissions: [
    { code: filesPermissions.objectUpload, name: '上传文件对象', moduleName: 'files' },
    { code: filesPermissions.objectViewOwn, name: '查看本人文件对象', moduleName: 'files' },
  ],
  menus: [],
};
