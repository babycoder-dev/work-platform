import { Pool, type PoolClient } from 'pg';
import { UNIT_OF_WORK_CONTEXT, type FileObjectDto, type FileReferenceDto, type UnitOfWork } from '@work/files-contract';
import type {
  AttachStagedFileInput,
  AttachStagedFileResult,
  ClaimExpiredStagedFilesInput,
  CreateFileObjectRecordInput,
  CreateFileReferenceRecordInput,
  FindAttachedFileObjectByReferenceInput,
  FilesRepository,
  FilesQuotaLimits,
} from './files.repository';

interface FileObjectRow {
  id: string;
  enterprise_id: string;
  provider: string;
  storage_key: string;
  original_name: string;
  media_type: string;
  size_bytes: string;
  sha256: string;
  status: FileObjectDto['status'];
  uploaded_by: string;
  created_at: Date;
  staged_expires_at: Date;
  deleted_at: Date | null;
}

interface FileReferenceRow {
  id: string;
  enterprise_id: string;
  file_id: string;
  owner_module: string;
  reference_type: string;
  reference_id: string;
  attached_by: string;
  created_at: Date;
}

const FILE_OBJECT_COLUMNS = `
  id,
  enterprise_id,
  provider,
  storage_key,
  original_name,
  media_type,
  size_bytes,
  sha256,
  status,
  uploaded_by,
  created_at,
  staged_expires_at,
  deleted_at
`;

const QUALIFIED_FILE_OBJECT_COLUMNS = `
  o.id,
  o.enterprise_id,
  o.provider,
  o.storage_key,
  o.original_name,
  o.media_type,
  o.size_bytes,
  o.sha256,
  o.status,
  o.uploaded_by,
  o.created_at,
  o.staged_expires_at,
  o.deleted_at
`;

const FILE_REFERENCE_COLUMNS = `
  id,
  enterprise_id,
  file_id,
  owner_module,
  reference_type,
  reference_id,
  attached_by,
  created_at
`;

export class PostgresFilesRepository implements FilesRepository {
  private readonly unitOfWorkClients = new WeakMap<UnitOfWork, PoolClient>();

  constructor(private readonly pool: Pool) {}

  async createFileObject(input: CreateFileObjectRecordInput): Promise<FileObjectDto> {
    return this.insertFileObject(this.pool, input);
  }

  async createStagedFileObjectWithQuota(
    input: CreateFileObjectRecordInput,
    quota: FilesQuotaLimits,
  ): Promise<FileObjectDto> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `files:tenant:${input.enterpriseId}`,
      ]);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `files:user:${input.enterpriseId}:${input.uploadedBy}`,
      ]);

      const tenantBytes = await this.sumStoredBytesWithClient(client, input.enterpriseId);
      const userBytes = await this.sumStoredBytesWithClient(client, input.enterpriseId, input.uploadedBy);
      if (tenantBytes + input.sizeBytes > quota.tenantQuotaBytes) {
        throw new Error('FILES_TENANT_QUOTA_EXCEEDED');
      }
      if (userBytes + input.sizeBytes > quota.userQuotaBytes) {
        throw new Error('FILES_USER_QUOTA_EXCEEDED');
      }

      const object = await this.insertFileObject(client, input);
      await client.query('COMMIT');
      return object;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertFileObject(
    executor: Pick<Pool | PoolClient, 'query'>,
    input: CreateFileObjectRecordInput,
  ): Promise<FileObjectDto> {
    const result = await executor.query<FileObjectRow>(
      `
        INSERT INTO files.file_objects (
          id,
          enterprise_id,
          provider,
          storage_key,
          original_name,
          media_type,
          size_bytes,
          sha256,
          status,
          uploaded_by,
          staged_expires_at,
          deleted_at
        )
        VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING ${FILE_OBJECT_COLUMNS}
      `,
      [
        input.id ?? null,
        input.enterpriseId,
        input.provider,
        input.storageKey,
        input.originalName,
        input.mediaType,
        input.sizeBytes,
        input.sha256,
        input.status ?? 'staged',
        input.uploadedBy,
        input.stagedExpiresAt,
        input.deletedAt ?? null,
      ],
    );
    return mapObject(result.rows[0]);
  }

  async findFileObjectById(enterpriseId: string, id: string): Promise<FileObjectDto | undefined> {
    const result = await this.pool.query<FileObjectRow>(
      `
        SELECT ${FILE_OBJECT_COLUMNS}
        FROM files.file_objects
        WHERE enterprise_id = $1 AND id = $2
      `,
      [enterpriseId, id],
    );
    return result.rows[0] ? mapObject(result.rows[0]) : undefined;
  }

  async findOwnFileObjectById(
    enterpriseId: string,
    uploadedBy: string,
    id: string,
  ): Promise<FileObjectDto | undefined> {
    const result = await this.pool.query<FileObjectRow>(
      `
        SELECT ${FILE_OBJECT_COLUMNS}
        FROM files.file_objects
        WHERE enterprise_id = $1
          AND uploaded_by = $2
          AND id = $3
          AND status <> 'deleted'
      `,
      [enterpriseId, uploadedBy, id],
    );
    return result.rows[0] ? mapObject(result.rows[0]) : undefined;
  }

  async findAttachedFileObjectByReference(
    input: FindAttachedFileObjectByReferenceInput,
  ): Promise<FileObjectDto | undefined> {
    const result = await this.pool.query<FileObjectRow>(
      `
        SELECT ${QUALIFIED_FILE_OBJECT_COLUMNS}
        FROM files.file_objects o
        INNER JOIN files.file_references r
          ON r.enterprise_id = o.enterprise_id
         AND r.file_id = o.id
        WHERE o.enterprise_id = $1
          AND o.id = $2
          AND o.status = 'attached'
          AND r.owner_module = $3
          AND r.reference_type = $4
          AND r.reference_id = $5
      `,
      [input.enterpriseId, input.fileId, input.ownerModule, input.referenceType, input.referenceId],
    );
    return result.rows[0] ? mapObject(result.rows[0]) : undefined;
  }

  async createFileReference(input: CreateFileReferenceRecordInput): Promise<FileReferenceDto> {
    const result = await this.pool.query<FileReferenceRow>(
      `
        INSERT INTO files.file_references (
          id,
          enterprise_id,
          file_id,
          owner_module,
          reference_type,
          reference_id,
          attached_by
        )
        VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7)
        RETURNING ${FILE_REFERENCE_COLUMNS}
      `,
      [
        input.id ?? null,
        input.enterpriseId,
        input.fileId,
        input.ownerModule,
        input.referenceType,
        input.referenceId,
        input.attachedBy,
      ],
    );
    return mapReference(result.rows[0]);
  }

  async listFileReferences(enterpriseId: string, fileId: string): Promise<FileReferenceDto[]> {
    const result = await this.pool.query<FileReferenceRow>(
      `
        SELECT ${FILE_REFERENCE_COLUMNS}
        FROM files.file_references
        WHERE enterprise_id = $1 AND file_id = $2
        ORDER BY created_at ASC
      `,
      [enterpriseId, fileId],
    );
    return result.rows.map(mapReference);
  }

  async withUnitOfWork<T>(operation: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const uow: UnitOfWork = { kind: 'unit-of-work', [UNIT_OF_WORK_CONTEXT]: client };
    try {
      await client.query('BEGIN');
      this.unitOfWorkClients.set(uow, client);
      const result = await operation(uow);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      this.unitOfWorkClients.delete(uow);
      client.release();
    }
  }

  async attachStagedFile(input: AttachStagedFileInput, uow: UnitOfWork): Promise<AttachStagedFileResult> {
    const client = this.unitOfWorkClients.get(uow);
    if (!client) {
      throw new Error('FILES_UNIT_OF_WORK_REQUIRED');
    }
      const object = await this.findFileObjectByIdForClient(client, input.enterpriseId, input.fileId);
      if (!object || object.uploadedBy !== input.uploadedBy) {
        return { kind: 'not_found' };
      }

      const existingReference = await client.query<FileReferenceRow>(
        `
          SELECT ${FILE_REFERENCE_COLUMNS}
          FROM files.file_references
          WHERE enterprise_id = $1 AND file_id = $2
          FOR UPDATE
        `,
        [input.enterpriseId, input.fileId],
      );
      if (existingReference.rows[0]) {
        const reference = mapReference(existingReference.rows[0]);
        if (
          reference.ownerModule === input.ownerModule &&
          reference.referenceType === input.referenceType &&
          reference.referenceId === input.referenceId &&
          object.status === 'attached'
        ) {
          return { kind: 'idempotent', object, reference };
        }
        return { kind: 'already_referenced' };
      }

      const claimed = await client.query<FileObjectRow>(
        `
          UPDATE files.file_objects
          SET status = 'attached'
          WHERE enterprise_id = $1
            AND id = $2
            AND uploaded_by = $3
            AND status = 'staged'
          RETURNING ${FILE_OBJECT_COLUMNS}
        `,
        [input.enterpriseId, input.fileId, input.uploadedBy],
      );
      if (!claimed.rows[0]) {
        return { kind: 'not_found' };
      }

      const referenceResult = await client.query<FileReferenceRow>(
        `
          INSERT INTO files.file_references (
            enterprise_id,
            file_id,
            owner_module,
            reference_type,
            reference_id,
            attached_by
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING ${FILE_REFERENCE_COLUMNS}
        `,
        [
          input.enterpriseId,
          input.fileId,
          input.ownerModule,
          input.referenceType,
          input.referenceId,
          input.attachedBy,
        ],
      );
      return {
        kind: 'attached',
        object: mapObject(claimed.rows[0]),
        reference: mapReference(referenceResult.rows[0]),
      };
  }

  async claimExpiredStagedFiles(input: ClaimExpiredStagedFilesInput): Promise<FileObjectDto[]> {
    const result = await this.pool.query<FileObjectRow>(
      `
        WITH candidates AS (
          SELECT o.enterprise_id, o.id
          FROM files.file_objects o
          WHERE (
              o.status = 'staged'
              AND o.staged_expires_at <= $1
              AND NOT EXISTS (
                SELECT 1
                FROM files.file_references r
                WHERE r.enterprise_id = o.enterprise_id AND r.file_id = o.id
              )
            )
            OR o.status = 'deleting'
          ORDER BY o.created_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        )
        UPDATE files.file_objects o
        SET status = 'deleting'
        FROM candidates c
        WHERE o.enterprise_id = c.enterprise_id AND o.id = c.id
        RETURNING ${QUALIFIED_FILE_OBJECT_COLUMNS}
      `,
      [input.now, input.limit],
    );
    return result.rows.map(mapObject);
  }

  async markFileDeleted(
    enterpriseId: string,
    fileId: string,
    deletedAt: string,
  ): Promise<FileObjectDto | undefined> {
    const result = await this.pool.query<FileObjectRow>(
      `
        UPDATE files.file_objects
        SET status = 'deleted',
            deleted_at = $3
        WHERE enterprise_id = $1 AND id = $2 AND status = 'deleting'
        RETURNING ${FILE_OBJECT_COLUMNS}
      `,
      [enterpriseId, fileId, deletedAt],
    );
    return result.rows[0] ? mapObject(result.rows[0]) : undefined;
  }

  async sumStoredBytes(enterpriseId: string, uploadedBy?: string): Promise<number> {
    return this.sumStoredBytesWithClient(this.pool, enterpriseId, uploadedBy);
  }

  private async sumStoredBytesWithClient(
    executor: Pick<Pool | PoolClient, 'query'>,
    enterpriseId: string,
    uploadedBy?: string,
  ): Promise<number> {
    const result = await executor.query<{ total: string | null }>(
      `
        SELECT COALESCE(SUM(size_bytes), 0)::text AS total
        FROM files.file_objects
        WHERE enterprise_id = $1
          AND ($2::uuid IS NULL OR uploaded_by = $2::uuid)
          AND status IN ('staged', 'attached', 'deleting')
      `,
      [enterpriseId, uploadedBy ?? null],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  private async findFileObjectByIdForClient(
    client: PoolClient,
    enterpriseId: string,
    id: string,
  ): Promise<FileObjectDto | undefined> {
    const result = await client.query<FileObjectRow>(
      `
        SELECT ${FILE_OBJECT_COLUMNS}
        FROM files.file_objects
        WHERE enterprise_id = $1 AND id = $2
      `,
      [enterpriseId, id],
    );
    return result.rows[0] ? mapObject(result.rows[0]) : undefined;
  }
}

function mapObject(row: FileObjectRow): FileObjectDto {
  return {
    id: row.id,
    enterpriseId: row.enterprise_id,
    provider: row.provider,
    storageKey: row.storage_key,
    originalName: row.original_name,
    mediaType: row.media_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    status: row.status,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at.toISOString(),
    stagedExpiresAt: row.staged_expires_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString(),
  };
}

function mapReference(row: FileReferenceRow): FileReferenceDto {
  return {
    id: row.id,
    enterpriseId: row.enterprise_id,
    fileId: row.file_id,
    ownerModule: row.owner_module,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    attachedBy: row.attached_by,
    createdAt: row.created_at.toISOString(),
  };
}
