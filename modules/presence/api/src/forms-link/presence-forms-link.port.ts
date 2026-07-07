import type { CurrentUserDto } from '@work/platform-contract';

export const PRESENCE_FORMS_LINK = Symbol('PRESENCE_FORMS_LINK');

export interface PresenceFormsLinkCreateInput {
  slotKey: string;
  definitionRevision: number;
  values: Array<{ fieldKey: string; value: unknown }>;
}

export interface PresenceFormsLinkPort {
  createStatusFormRecord(
    currentUser: CurrentUserDto,
    input: PresenceFormsLinkCreateInput,
    audit: { traceId?: string; ip?: string; userAgent?: string },
  ): Promise<{ recordId: string }>;
}
