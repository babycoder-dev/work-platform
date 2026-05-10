import type { ErrorResponse } from './error-response';

interface ApiErrorOptions {
  status?: number;
  traceId?: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly traceId?: string;
  readonly details?: unknown;

  constructor(code: string, message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = options.status;
    this.traceId = options.traceId;
    this.details = options.details;
  }

  static fromResponse(payload: unknown, fallback: ApiErrorOptions = {}): ApiError {
    if (isErrorResponse(payload)) {
      return new ApiError(payload.code, payload.message, {
        status: fallback.status,
        traceId: payload.traceId ?? fallback.traceId,
        details: payload.details,
      });
    }

    return new ApiError('COMMON_HTTP_ERROR', '请求失败', {
      status: fallback.status,
      traceId: fallback.traceId,
      details: payload,
    });
  }

  toJSON(): ErrorResponse {
    return {
      success: false,
      code: this.code,
      message: this.message,
      traceId: this.traceId,
      details: this.details,
    };
  }
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ErrorResponse>;
  return candidate.success === false && typeof candidate.code === 'string';
}
