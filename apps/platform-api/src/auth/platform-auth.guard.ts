import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { PlatformRequest } from './request-user';

@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformRequest>();
    const token = extractBearerToken(request.headers?.authorization);
    if (!token) {
      throw new UnauthorizedException('未登录');
    }

    request.currentUser = await this.authService.authenticateAccessToken(token);
    return true;
  }
}

function extractBearerToken(headerValue: string | string[] | undefined): string | undefined {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!value) {
    return undefined;
  }

  const [scheme, token] = value.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return undefined;
  }

  return token;
}
