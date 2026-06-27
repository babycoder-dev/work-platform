import { Avatar, Drawer, Tag } from '@work/ui';
import type { ReactNode } from 'react';
import type { EmployeeDto } from '@work/platform-contract';
import { getPlatformCurrentUser } from '../runtime';
import { CustomFieldsSection } from './CustomFieldsSection';
import { PresenceSection } from './PresenceSection';
import { StatusTimelineSection } from './StatusTimelineSection';

export function EmployeeProfileDrawer({
  employee,
  departmentName,
  roleNames,
  employeeNameById,
  open,
  refreshKey,
  onClose,
}: {
  employee: EmployeeDto | null;
  departmentName?: string;
  roleNames: string[];
  employeeNameById: Map<string, string>;
  open: boolean;
  refreshKey: number;
  onClose: () => void;
}) {
  const currentUser = getPlatformCurrentUser();
  if (!employee) {
    return null;
  }

  return (
    <Drawer onClose={onClose} open={open} title={`${employee.name} · 成员详情`} width="default">
      <div className="employee-profile">
        <ProfileHeader departmentName={departmentName} employee={employee} />
        <ProfileSection title="账号信息">
          <KeyValue
            items={[
              ['工号', employee.employeeNo],
              ['登录账号', employee.account],
              ['首次登录', employee.mustChangePassword ? '需修改密码' : '已完成'],
            ]}
          />
        </ProfileSection>
        <ProfileSection title="组织与角色">
          <KeyValue
            items={[
              ['所属部门', departmentName ?? employee.departmentId ?? '—'],
              ['职务', employee.title ?? '—'],
              ['角色', roleNames.length > 0 ? roleNames : ['—']],
            ]}
          />
        </ProfileSection>
        <ProfileSection title="联系方式">
          <KeyValue
            items={[
              ['手机', employee.mobile ?? '—'],
              ['邮箱', employee.email ?? '—'],
            ]}
          />
        </ProfileSection>
        <ProfileSection title="在位状态">
          <PresenceSection currentUser={currentUser} employeeId={employee.id} />
        </ProfileSection>
        <ProfileSection title="自定义字段">
          <CustomFieldsSection currentUser={currentUser} employeeId={employee.id} />
        </ProfileSection>
        <ProfileSection title="近况脉络">
          <StatusTimelineSection
            employee={employee}
            employeeNameById={employeeNameById}
            refreshKey={refreshKey}
          />
        </ProfileSection>
      </div>
    </Drawer>
  );
}

function ProfileHeader({
  employee,
  departmentName,
}: {
  employee: EmployeeDto;
  departmentName?: string;
}) {
  return (
    <section className="employee-profile__header">
      <Avatar name={employee.name} size="lg" />
      <div>
        <h3>{employee.name}</h3>
        <p>
          {employee.title ?? '未设置职务'} ·{' '}
          {departmentName ?? employee.departmentId ?? '未分配部门'}
        </p>
        <Tag color={employee.status === 'active' ? 'green' : 'gray'} dot>
          {statusLabel(employee.status)}
        </Tag>
      </div>
    </section>
  );
}

function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="employee-profile__section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function KeyValue({ items }: { items: Array<[string, string | string[]]> }) {
  return (
    <dl className="employee-profile__kv">
      {items.map(([label, value]) => (
        <div className="employee-profile__kv-row" key={label}>
          <dt>{label}</dt>
          <dd>
            {Array.isArray(value) ? (
              <span className="employee-profile__tags">
                {value.map((item) => (
                  <Tag color="blue" key={item}>
                    {item}
                  </Tag>
                ))}
              </span>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function statusLabel(status: EmployeeDto['status']): string {
  if (status === 'active') {
    return '在职';
  }
  if (status === 'disabled') {
    return '停用';
  }
  return '离职';
}
