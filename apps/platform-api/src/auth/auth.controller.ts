import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import type { LoginInput } from '@work/platform-contract';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() input: LoginInput) {
    return this.authService.login(input);
  }

  @Get('password-policy')
  getPasswordPolicy() {
    return this.authService.getPasswordPolicy();
  }
}
