import { PlatformAdminPlaceholder } from './PlatformAdminPlaceholder';

export default function EmployeesPage() {
  return (
    <PlatformAdminPlaceholder
      capabilities={['员工档案', '账号状态', '角色分配']}
      description="这里将承载员工、账号和角色关系管理。"
      title="员工管理"
    />
  );
}
