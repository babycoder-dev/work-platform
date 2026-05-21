import type { ModuleManifestDto } from '@work/platform-contract';
import { reportPermissions } from './permissions';

export const REPORT_MODULE_MANIFEST_ID = '00000000-0000-0000-0000-000000000204';

export const reportPlatformManifest: ModuleManifestDto = {
  id: REPORT_MODULE_MANIFEST_ID,
  moduleName: 'report',
  displayName: '工作汇报',
  description: '日/周工作汇报填写与逐级汇总',
  apiPrefix: '/api/report',
  webEntry: '/report',
  status: 'disabled',
  permissions: [
    { code: reportPermissions.dailyCreate, name: '提交日报', moduleName: 'report' },
    { code: reportPermissions.weeklyCreate, name: '提交周报', moduleName: 'report' },
    { code: reportPermissions.weeklyView, name: '查看周报', moduleName: 'report' },
  ],
  menus: [],
};
