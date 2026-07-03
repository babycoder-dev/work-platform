export const presenceEvents = {
  statusChanged: 'presence.status.changed',
} as const;

export const presetPresenceStatusKeys = [
  'working',
  'business_trip',
  'field_research',
  'out',
  'leave',
] as const;

export type PresetPresenceStatusKey = (typeof presetPresenceStatusKeys)[number];
export type PresenceStatus = string;

export interface PresenceStatusChangedEvent {
  recordId: string;
  enterpriseId: string;
  userId: string;
  status: PresenceStatus;
  statusLabel: string;
  startAt: string;
  endAt?: string;
  changedBy: string;
  changeKind: 'created' | 'cancelled';
}
