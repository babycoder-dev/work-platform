import type { CreateDepartmentInput } from '@work/platform-contract';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateDepartmentDto implements CreateDepartmentInput {
  @IsNotEmpty()
  @IsString()
  enterpriseId!: string;

  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  managerUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
