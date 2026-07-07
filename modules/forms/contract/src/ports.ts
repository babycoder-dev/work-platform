import type {
  FormActorContext,
  FormDefinitionDto,
  FormRecordDto,
  CreateFormRecordInput,
  FormAuditContext,
} from './forms.dto';
import type { FormSlotKey } from './slots';
import type { CurrentUserDto } from '@work/platform-contract';

export const FORMS_SERVICE = Symbol('FORMS_SERVICE');

export interface FormsPort {
  getDefinition(actor: FormActorContext, slotKey: FormSlotKey): Promise<FormDefinitionDto>;
  createRecord(
    actor: FormActorContext,
    currentUser: CurrentUserDto,
    input: CreateFormRecordInput,
    auditContext?: FormAuditContext,
  ): Promise<FormRecordDto>;
  getRecordById(
    actor: FormActorContext,
    currentUser: CurrentUserDto,
    recordId: string,
  ): Promise<FormRecordDto>;
  getRecordBySubject(
    actor: FormActorContext,
    currentUser: CurrentUserDto,
    input: { slotKey: string; subjectType: string; subjectId: string },
  ): Promise<FormRecordDto>;
  upsertRecordBySubject(
    actor: FormActorContext,
    currentUser: CurrentUserDto,
    input: CreateFormRecordInput,
    auditContext?: FormAuditContext,
  ): Promise<FormRecordDto>;
  /**
   * Missing permission returns 404 intentionally so callers cannot enumerate
   * whether a form record exists.
   */
  getRecord(actor: FormActorContext, recordId: string): Promise<FormRecordDto>;
}
