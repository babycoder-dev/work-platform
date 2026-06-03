import type { PermissionDefinition } from '@work/platform-sdk';

export const filesPermissions = {
  objectUpload: 'files:object:upload',
  objectViewOwn: 'files:object:view-own',
} as const;

export const filesPermissionDefinitions: PermissionDefinition[] = [
  {
    code: filesPermissions.objectUpload,
    name: '上传文件对象',
  },
  {
    code: filesPermissions.objectViewOwn,
    name: '查看本人文件对象',
  },
];
