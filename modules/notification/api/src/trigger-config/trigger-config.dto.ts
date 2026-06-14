import type {
  TriggerRecipient,
  TriggerRecipientKind,
  UpdateTriggerConfigInput,
} from '@work/notification-contract';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';

const TRIGGER_RECIPIENT_KINDS: TriggerRecipientKind[] = [
  'department_manager',
  'role',
  'subject',
  'self',
];

export class TriggerRecipientDto implements TriggerRecipient {
  @IsIn(TRIGGER_RECIPIENT_KINDS)
  kind!: TriggerRecipientKind;

  @IsOptional()
  @IsString()
  roleCode?: string;
}

export class UpdateTriggerConfigDto implements UpdateTriggerConfigInput {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TriggerRecipientDto)
  defaultRecipients?: TriggerRecipientDto[];
}
