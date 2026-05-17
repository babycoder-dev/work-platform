import { ApiError } from '@work/errors';
import { describe, expect, it } from 'vitest';
import { mapPostgresError } from './postgres-error.mapper';

describe('mapPostgresError', () => {
  it('maps PostgreSQL unique violations to platform duplicate errors', () => {
    expect(() => mapPostgresError({ code: '23505' })).toThrow(
      expect.objectContaining({
        code: 'PLATFORM_DUPLICATE_RESOURCE',
        status: 409,
      }),
    );
  });

  it('maps PostgreSQL foreign key violations to platform reference errors', () => {
    expect(() => mapPostgresError({ code: '23503' })).toThrow(
      expect.objectContaining({
        code: 'PLATFORM_REFERENCE_NOT_FOUND',
        status: 400,
      }),
    );
  });

  it('preserves unknown errors', () => {
    const error = new ApiError('CUSTOM_ERROR', 'custom');

    expect(() => mapPostgresError(error)).toThrow(error);
  });
});
