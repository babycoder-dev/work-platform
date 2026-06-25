import { useEffect, useState } from 'react';
import { EmptyState, Tag } from '@work/ui';
import type { CurrentUserDto } from '@work/platform-contract';
import { getPresenceApi } from '../runtime';
import type { EmployeePresence, PresenceStatus, PresenceStatusRecord } from '../api/presence-types';

const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  // Keep in sync with the presence web StatusBadge labels; do not import across module boundary.
  working: '在岗',
  business_trip: '出差',
  field_research: '外出调研',
  out: '外出',
  leave: '休假',
};

type PresenceState =
  | { kind: 'hidden' }
  | { kind: 'loading' }
  | { kind: 'ready'; record: PresenceStatusRecord | null };

export function PresenceSection({
  employeeId,
  currentUser,
}: {
  employeeId: string;
  currentUser: CurrentUserDto;
}) {
  const canViewPresence = currentUser.permissions.some(
    (permission) => permission.code === 'presence:board:view',
  );
  const [state, setState] = useState<PresenceState>(
    canViewPresence ? { kind: 'loading' } : { kind: 'hidden' },
  );

  useEffect(() => {
    if (!canViewPresence) {
      setState({ kind: 'hidden' });
      return;
    }
    let ignore = false;
    setState({ kind: 'loading' });
    void getPresenceApi()
      .getEmployeePresence(employeeId)
      .then((result: EmployeePresence) => {
        if (!ignore) {
          setState({ kind: 'ready', record: result.record });
        }
      })
      .catch(() => {
        if (!ignore) {
          setState({ kind: 'ready', record: null });
        }
      });
    return () => {
      ignore = true;
    };
  }, [canViewPresence, employeeId]);

  if (state.kind === 'hidden') {
    return <EmptyState title="当前无在位记录" description="无可查看的在位信息。" />;
  }
  if (state.kind === 'loading') {
    return <p>加载中…</p>;
  }
  if (!state.record) {
    return <EmptyState title="当前无在位记录" description="该员工当前没有在位记录。" />;
  }

  return (
    <article className="employee-profile__presence-card">
      <span
        className={`employee-profile__presence-icon employee-profile__presence-icon--${state.record.status}`}
      />
      <div>
        <div className="employee-profile__presence-title">
          <Tag color={presenceColor(state.record.status)} dot>
            {PRESENCE_LABELS[state.record.status]}
          </Tag>
        </div>
        <p className="employee-profile__presence-sub">
          {state.record.departmentName} · {state.record.userName}
        </p>
        <p className="employee-profile__presence-sub">
          {formatDateTime(state.record.startAt)}
          {state.record.endAt ? ` 至 ${formatDateTime(state.record.endAt)}` : ''}
          {state.record.remark ? ` · ${state.record.remark}` : ''}
        </p>
      </div>
    </article>
  );
}

function presenceColor(status: PresenceStatus): 'green' | 'purple' | 'cyan' | 'orange' {
  if (status === 'working') {
    return 'green';
  }
  if (status === 'business_trip') {
    return 'purple';
  }
  if (status === 'field_research') {
    return 'cyan';
  }
  return 'orange';
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
