import type { CurrentUserDto } from '@work/platform-contract';
import type { TraceRequest } from '@work/nest-common';

export interface PlatformRequest extends TraceRequest {
  currentUser?: CurrentUserDto;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
}

export interface PlatformAuditContext {
  actorUserId?: string;
  actorAccount?: string;
  traceId?: string;
  ip?: string;
  userAgent?: string;
}

export function buildPlatformAuditContext(request: PlatformRequest): PlatformAuditContext {
  return {
    actorUserId: request.currentUser?.id,
    actorAccount: request.currentUser?.account,
    traceId: request.traceId,
    ip: resolveClientIp(request),
    userAgent: resolveHeader(request, 'user-agent'),
  };
}

export function resolveClientIp(request: PlatformRequest): string | undefined {
  const forwardedFor = resolveHeader(request, 'x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim() || undefined;
  }

  return resolveHeader(request, 'x-real-ip') ?? request.ip ?? request.socket?.remoteAddress;
}

export function resolveHeader(request: PlatformRequest, name: string): string | undefined {
  const value = request.headers?.[name];
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
