import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FORM_FIELD_LIMITS, FORM_FIELD_TYPES, type FormFieldType } from '@work/forms-contract';

export class FormFieldOptionInputDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(FORM_FIELD_LIMITS.optionKeyMaxLength)
  key!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(FORM_FIELD_LIMITS.optionLabelMaxLength)
  label!: string;
}

export class FormFieldInputDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(FORM_FIELD_LIMITS.fieldKeyMaxLength)
  fieldKey!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(FORM_FIELD_LIMITS.labelMaxLength)
  label!: string;

  @IsIn(FORM_FIELD_TYPES)
  fieldType!: FormFieldType;

  @IsBoolean()
  required!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(FORM_FIELD_LIMITS.descriptionMaxLength)
  description?: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormFieldOptionInputDto)
  options?: FormFieldOptionInputDto[];
}

export class UpdateFormDefinitionDto {
  @IsInt()
  @Min(0)
  revision!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormFieldInputDto)
  fields!: FormFieldInputDto[];
}

export class FormRecordValueInputDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(FORM_FIELD_LIMITS.fieldKeyMaxLength)
  fieldKey!: string;

  @Allow()
  value!: unknown;
}

export class UpsertProfileRecordDto {
  @IsInt()
  @Min(0)
  definitionRevision!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormRecordValueInputDto)
  values!: FormRecordValueInputDto[];
}
