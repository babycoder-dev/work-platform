import type {
  AssignUserRolesInput,
  CreateEmployeeInput,
  EmployeeStatus,
  ResetEmployeePasswordInput,
  UpdateEmployeeProfileInput,
  UpdateEmployeeStatusInput,
  UpdateMyProfileInput,
} from '@work/platform-contract';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

const EMPLOYEE_STATUSES: EmployeeStatus[] = ['active', 'disabled', 'left'];

export class CreateEmployeeDto implements Omit<CreateEmployeeInput, 'enterpriseId'> {
  @IsNotEmpty()
  @IsString()
  employeeNo!: string;

  @IsNotEmpty()
  @IsString()
  account!: string;

  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  initialPassword!: string;

}

export class UpdateMyProfileDto implements UpdateMyProfileInput {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  title?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  mobile?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEmail()
  email?: string | null;
}

export class UpdateEmployeeProfileDto
  extends UpdateMyProfileDto
  implements UpdateEmployeeProfileInput
{
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  departmentId?: string | null;
}

export class UpdateEmployeeStatusDto implements UpdateEmployeeStatusInput {
  @IsIn(EMPLOYEE_STATUSES)
  status!: EmployeeStatus;
}

export class AssignEmployeeRolesDto implements Omit<AssignUserRolesInput, 'userId'> {
  @IsArray()
  @IsString({ each: true })
  roleIds!: string[];
}

export class ResetEmployeePasswordDto implements ResetEmployeePasswordInput {
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
