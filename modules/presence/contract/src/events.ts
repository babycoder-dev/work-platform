export const presenceEvents = {
  statusChanged: 'presence.status.changed',
} as const;

export interface PresenceStatusChangedEvent {
  recordId: string;
  enterpriseId: string;
  userId: string;
  status: PresenceStatus;
  startAt: string;
  endAt?: string;
  changedBy: string;
  changeKind: 'created' | 'cancelled';
}

export type PresenceStatus = 'working' | 'business_trip' | 'field_research' | 'out' | 'leave';
