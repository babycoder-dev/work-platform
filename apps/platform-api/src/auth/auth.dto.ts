import type { ChangePasswordInput, LoginInput } from '@work/platform-contract';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto implements LoginInput {
  @IsNotEmpty()
  @IsString()
  account!: string;

  @IsNotEmpty()
  @IsString()
  password!: string;
}

export class ChangePasswordDto implements ChangePasswordInput {
  @IsNotEmpty()
  @IsString()
  oldPassword!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
