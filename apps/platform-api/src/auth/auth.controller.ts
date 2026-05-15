import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { LoginDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() input: LoginDto) {
    return this.authService.login(input);
  }

  @Get('password-policy')
  getPasswordPolicy() {
    return this.authService.getPasswordPolicy();
  }
}
