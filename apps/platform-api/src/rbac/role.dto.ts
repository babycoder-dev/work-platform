import type {
  CreateRoleInput,
  DataScope,
  PlatformDataType,
  RoleDataScope,
} from '@work/platform-contract';
import { PLATFORM_DATA_TYPES } from '@work/platform-contract';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

const DATA_SCOPES: DataScope[] = ['self', 'department', 'department_tree', 'company', 'custom'];

export class RoleDataScopeDto implements RoleDataScope {
  @IsIn(PLATFORM_DATA_TYPES)
  dataType!: PlatformDataType;

  @IsIn(DATA_SCOPES)
  scope!: DataScope;
}

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleDataScopeDto)
  dataScopes!: RoleDataScopeDto[];
}
