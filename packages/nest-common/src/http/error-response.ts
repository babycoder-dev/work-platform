import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiError, type ErrorResponse } from '@work/errors';

export interface NormalizedHttpError {
  status: number;
  body: ErrorResponse;
}

export function createErrorResponse(exception: unknown, traceId?: string): NormalizedHttpError {
  if (exception instanceof ApiError) {
    const body = exception.toJSON();

    return {
      status: exception.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        ...body,
        traceId: body.traceId ?? traceId,
      },
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const payload = exception.getResponse();

    return {
      status,
      body: {
        success: false,
        code: `HTTP_${status}`,
        message: resolveHttpExceptionMessage(payload, exception.message),
        traceId,
        details: typeof payload === 'object' ? payload : undefined,
      },
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: {
      success: false,
      code: 'COMMON_INTERNAL_ERROR',
      message: '系统异常',
      traceId,
    },
  };
}

function resolveHttpExceptionMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const message = (payload as { message?: unknown }).message;
  if (Array.isArray(message)) {
    return message.join('; ');
  }

  if (typeof message === 'string') {
    return message;
  }

  return fallback;
}
