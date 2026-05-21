import { PlatformAdminPlaceholder } from './PlatformAdminPlaceholder';

export default function RolesPage() {
  return (
    <PlatformAdminPlaceholder
      capabilities={['角色列表', '权限点', '数据范围']}
      description="这里将承载角色、权限和数据范围管理。"
      title="角色权限"
    />
  );
}
