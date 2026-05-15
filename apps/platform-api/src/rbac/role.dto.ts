import type { CreateRoleInput, DataScope } from '@work/platform-contract';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const DATA_SCOPES: DataScope[] = ['self', 'department', 'department_tree', 'company', 'custom'];

export class CreateRoleDto implements CreateRoleInput {
  @IsNotEmpty()
  @IsString()
  enterpriseId!: string;

  @IsNotEmpty()
  @IsString()
  code!: string;

  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  permissionCodes!: string[];

  @IsIn(DATA_SCOPES)
  dataScope!: DataScope;
}
