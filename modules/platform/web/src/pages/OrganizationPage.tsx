import { PlatformAdminPlaceholder } from './PlatformAdminPlaceholder';

export default function OrganizationPage() {
  return (
    <PlatformAdminPlaceholder
      capabilities={['企业信息', '部门树', '部门负责人']}
      description="这里将承载企业和部门组织结构管理。"
      title="组织架构"
    />
  );
}
