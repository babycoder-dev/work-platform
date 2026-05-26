import type { PresenceStatus } from '@work/presence-contract';

const STATUS_LABELS: Record<PresenceStatus, string> = {
  working: '在岗',
  business_trip: '出差',
  field_research: '外出调研',
  out: '外出',
  leave: '休假',
};

export function formatStatusLabel(status: PresenceStatus): string {
  return STATUS_LABELS[status];
}

export function StatusBadge({ status }: { status: PresenceStatus }) {
  return <span className={`status-badge status-badge--${status}`}>{STATUS_LABELS[status]}</span>;
}
