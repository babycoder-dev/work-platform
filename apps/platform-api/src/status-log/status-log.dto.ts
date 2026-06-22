import type { CreateStatusLogsInput } from '@work/platform-contract';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateStatusLogsDto implements CreateStatusLogsInput {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  subjectEmployeeIds!: string[];

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(2000)
  content!: string;
}

export function parseStatusLogListQuery(limit?: string, offset?: string) {
  return {
    limit: parseNumber(limit),
    offset: parseNumber(offset),
  };
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  return Number(value);
}
