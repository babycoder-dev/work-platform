import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import { dtoValidationPipe, type TraceRequest } from '@work/nest-common';
import { LoginDto } from './auth.dto';
import { AuthService } from './auth.service';

interface AuthRequest extends TraceRequest {
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  login(@Body(dtoValidationPipe(LoginDto)) input: LoginDto, @Req() request: AuthRequest) {
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

function resolveClientIp(request: AuthRequest): string | undefined {
  const forwardedFor = resolveHeader(request, 'x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim() || undefined;
  }

  return resolveHeader(request, 'x-real-ip') ?? request.ip ?? request.socket?.remoteAddress;
}

function resolveHeader(request: AuthRequest, name: string): string | undefined {
  const value = request.headers?.[name];
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
