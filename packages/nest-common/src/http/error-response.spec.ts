import { BadRequestException } from '@nestjs/common';
import { ApiError } from '@work/errors';
import { describe, expect, it } from 'vitest';
import { createErrorResponse } from './error-response';

describe('createErrorResponse', () => {
  it('normalizes ApiError responses', () => {
    const response = createErrorResponse(new ApiError('TEST_ERROR', '测试错误', { status: 422 }), 'trace-1');

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      success: false,
      code: 'TEST_ERROR',
      message: '测试错误',
      traceId: 'trace-1',
      details: undefined,
    });
  });

  it('normalizes Nest HTTP exceptions with trace id', () => {
    const response = createErrorResponse(new BadRequestException(['字段不能为空']), 'trace-2');

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('HTTP_400');
    expect(response.body.message).toBe('字段不能为空');
    expect(response.body.traceId).toBe('trace-2');
  });

  it('hides unknown exception details', () => {
    const response = createErrorResponse(new Error('database password leaked'), 'trace-3');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      code: 'COMMON_INTERNAL_ERROR',
      message: '系统异常',
      traceId: 'trace-3',
    });
  });
});
