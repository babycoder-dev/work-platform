import type { ModuleManifestDto } from '@work/platform-contract';
import { approvalPermissions } from './permissions';

export const APPROVAL_MODULE_MANIFEST_ID = '00000000-0000-0000-0000-000000000203';

export const approvalPlatformManifest: ModuleManifestDto = {
  id: APPROVAL_MODULE_MANIFEST_ID,
  moduleName: 'approval',
  displayName: '审批',
  description: '请假、外出等轻量行政审批流程',
  apiPrefix: '/api/approval',
  webEntry: '/approval',
  status: 'disabled',
  permissions: [
    { code: approvalPermissions.instanceCreate, name: '发起审批', moduleName: 'approval' },
    { code: approvalPermissions.taskApprove, name: '处理审批任务', moduleName: 'approval' },
  ],
  menus: [],
};
