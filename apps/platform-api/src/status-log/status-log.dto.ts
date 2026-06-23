import type { CreateStatusLogsInput } from '@work/platform-contract';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateStatusLogsDto implements CreateStatusLogsInput {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    each: true,
  })
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
