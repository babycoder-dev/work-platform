export const presenceEvents = {
  statusChanged: 'presence.status.changed',
} as const;

export interface PresenceStatusChangedEvent {
  userId: string;
  status: PresenceStatus;
  startAt: string;
  endAt?: string;
  changedBy: string;
}

export type PresenceStatus = 'working' | 'business_trip' | 'field_research' | 'out' | 'leave';
