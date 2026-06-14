export type TriggerRecipientKind = 'department_manager' | 'role' | 'subject' | 'self';

export interface TriggerRecipient {
  kind: TriggerRecipientKind;
  roleCode?: string;
}

export interface TriggerConfigDto {
  triggerKey: string;
  enabled: boolean;
  defaultRecipients: TriggerRecipient[];
  updatedAt: string;
}

export interface UpdateTriggerConfigInput {
  enabled?: boolean;
  defaultRecipients?: TriggerRecipient[];
}
