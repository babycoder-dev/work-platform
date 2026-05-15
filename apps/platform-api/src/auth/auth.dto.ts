import type { LoginInput } from '@work/platform-contract';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto implements LoginInput {
  @IsNotEmpty()
  @IsString()
  account!: string;

  @IsNotEmpty()
  @IsString()
  password!: string;
}
