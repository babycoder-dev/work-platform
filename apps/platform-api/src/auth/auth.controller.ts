import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import { dtoValidationPipe } from '@work/nest-common';
import { LoginDto } from './auth.dto';
import type { PlatformRequest } from './request-user';
import { resolveClientIp, resolveHeader } from './request-user';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  login(@Body(dtoValidationPipe(LoginDto)) input: LoginDto, @Req() request: PlatformRequest) {
    return this.authService.login(input, {
      traceId: request.traceId,
      ip: resolveClientIp(request),
      userAgent: resolveHeader(request, 'user-agent'),
    });
  }

  @Get('password-policy')
  getPasswordPolicy() {
    return this.authService.getPasswordPolicy();
  }
}
