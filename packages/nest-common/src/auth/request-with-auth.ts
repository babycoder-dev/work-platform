export interface CurrentUserAuthSnapshot {
  id: string;
  account: string;
  employeeNo: string;
  name: string;
  enterpriseId: string;
  departmentId?: string;
  departmentName?: string;
  permissions: Array<{ code: string }>;
}

export interface RequestWithAuth {
  currentUser?: CurrentUserAuthSnapshot;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
  traceId?: string;
}

export interface AuthAuditContext {
  traceId?: string;
  ip?: string;
  userAgent?: string;
}

export function buildAuthAuditContext(request: RequestWithAuth): AuthAuditContext {
  return {
    traceId: request.traceId,
    ip: resolveClientIp(request),
    userAgent: resolveHeader(request, 'user-agent'),
  };
}

function resolveClientIp(request: RequestWithAuth): string | undefined {
  const forwardedFor = resolveHeader(request, 'x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim() || undefined;
  }
  return resolveHeader(request, 'x-real-ip') ?? request.ip ?? request.socket?.remoteAddress;
}

function resolveHeader(request: RequestWithAuth, name: string): string | undefined {
  const value = request.headers?.[name];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
