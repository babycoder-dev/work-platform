import { ApiError } from '@work/errors';

const POSTGRES_UNIQUE_VIOLATION = '23505';
const POSTGRES_FOREIGN_KEY_VIOLATION = '23503';

interface PostgresErrorShape {
  code?: string;
}

export function mapPostgresError(error: unknown): never {
  const postgresError = asPostgresError(error);

  if (postgresError?.code === POSTGRES_UNIQUE_VIOLATION) {
    throw new ApiError('PLATFORM_DUPLICATE_RESOURCE', '资源已存在', { status: 409 });
  }

  if (postgresError?.code === POSTGRES_FOREIGN_KEY_VIOLATION) {
    throw new ApiError('PLATFORM_REFERENCE_NOT_FOUND', '关联资源不存在', { status: 400 });
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
