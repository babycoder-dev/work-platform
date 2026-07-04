export type PresenceStatusTypeStatus = 'active' | 'archived';

export interface PresenceStatusTypeDto {
  id: string;
  enterpriseId: string;
  key: string;
  label: string;
  isPreset: boolean;
  isDefault: boolean;
  status: PresenceStatusTypeStatus;
  sortOrder: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePresenceStatusTypeInput {
  key: string;
  label: string;
  sortOrder?: number;
}

export interface UpdatePresenceStatusTypeInput {
  label?: string;
  sortOrder?: number;
}
