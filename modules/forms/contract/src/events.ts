export const formsEvents = {
  definitionUpdated: 'forms.definition.updated',
  recordCreated: 'forms.record.created',
} as const;

export interface FormsDefinitionUpdatedEvent {
  enterpriseId: string;
  slotKey: FormSlotKey;
  revision: number;
  fieldKeys: string[];
  updatedBy: string;
  occurredAt: string;
}

export interface FormsRecordCreatedEvent {
  enterpriseId: string;
  slotKey: FormSlotKey;
  recordId: string;
  subjectType: string;
  subjectId: string;
  submittedBy: string;
  occurredAt: string;
}

import type { FormSlotKey } from './slots';
