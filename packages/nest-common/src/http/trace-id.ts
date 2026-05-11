import { randomUUID } from 'node:crypto';

export const TRACE_ID_HEADER = 'x-trace-id';

export interface TraceRequest {
  headers?: Record<string, string | string[] | undefined>;
  traceId?: string;
}

export interface TraceResponse {
  setHeader(name: string, value: string): void;
}

export type NextFunction = () => void;

export function resolveTraceId(request: TraceRequest): string {
  const headerValue = request.headers?.[TRACE_ID_HEADER];
  if (Array.isArray(headerValue)) {
    return headerValue[0] ?? randomUUID();
  }

  return headerValue || randomUUID();
}

export function traceIdMiddleware(request: TraceRequest, response: TraceResponse, next: NextFunction) {
  const traceId = resolveTraceId(request);
  request.traceId = traceId;
  response.setHeader('X-Trace-Id', traceId);
  next();
}
