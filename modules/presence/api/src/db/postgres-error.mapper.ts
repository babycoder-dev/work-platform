import { ApiError } from '@work/errors';

const POSTGRES_UNIQUE_VIOLATION = '23505';
const POSTGRES_FOREIGN_KEY_VIOLATION = '23503';
const POSTGRES_CHECK_VIOLATION = '23514';

interface PostgresErrorShape {
  code?: string;
}

export function mapPresencePostgresError(error: unknown): never {
  const postgresError = asPostgresError(error);

  if (postgresError?.code === POSTGRES_UNIQUE_VIOLATION) {
    throw new ApiError('PRESENCE_DUPLICATE_RESOURCE', '在位记录已存在', { status: 409 });
  }

  if (postgresError?.code === POSTGRES_FOREIGN_KEY_VIOLATION) {
    throw new ApiError('PRESENCE_REFERENCE_NOT_FOUND', '关联资源不存在', { status: 400 });
  }

  if (postgresError?.code === POSTGRES_CHECK_VIOLATION) {
    throw new ApiError('PRESENCE_INVALID_STATE', '在位记录字段不合法', { status: 400 });
  }

  throw error;
}

function asPostgresError(error: unknown): PostgresErrorShape | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const candidate = error as PostgresErrorShape;
  return typeof candidate.code === 'string' ? candidate : undefined;
}
