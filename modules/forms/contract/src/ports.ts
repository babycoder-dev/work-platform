import type {
  FormActorContext,
  FormDefinitionDto,
  FormRecordDto,
  CreateFormRecordInput,
  FormAuditContext,
} from './forms.dto';
import type { FormSlotKey } from './slots';

export const FORMS_SERVICE = Symbol('FORMS_SERVICE');

export interface FormsPort {
  getDefinition(actor: FormActorContext, slotKey: FormSlotKey): Promise<FormDefinitionDto>;
  createRecord(
    actor: FormActorContext,
    input: CreateFormRecordInput,
    auditContext?: FormAuditContext,
  ): Promise<FormRecordDto>;
  /**
   * Missing permission returns 404 intentionally so callers cannot enumerate
   * whether a form record exists.
   */
  getRecord(actor: FormActorContext, recordId: string): Promise<FormRecordDto>;
}
