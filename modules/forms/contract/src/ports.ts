import type {
  FormActorContext,
  FormDefinitionDto,
  FormRecordDto,
  CreateFormRecordInput,
} from './forms.dto';
import type { FormSlotKey } from './events';

export const FORMS_SERVICE = Symbol('FORMS_SERVICE');

export interface FormsPort {
  getDefinition(actor: FormActorContext, slotKey: FormSlotKey): Promise<FormDefinitionDto>;
  createRecord(actor: FormActorContext, input: CreateFormRecordInput): Promise<FormRecordDto>;
  getRecord(actor: FormActorContext, recordId: string): Promise<FormRecordDto>;
}
