import type {
  AssignUserRolesInput,
  CreateEmployeeInput,
  EmployeeStatus,
  ResetEmployeePasswordInput,
  UpdateEmployeeStatusInput,
} from '@work/platform-contract';
import { IsArray, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

const EMPLOYEE_STATUSES: EmployeeStatus[] = ['active', 'disabled', 'left'];

export class CreateEmployeeDto implements CreateEmployeeInput {
  @IsNotEmpty()
  @IsString()
  enterpriseId!: string;

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
