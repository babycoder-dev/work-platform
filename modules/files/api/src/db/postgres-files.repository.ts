import { Pool } from 'pg';
import type { FileObjectDto, FileReferenceDto } from '@work/files-contract';
import type {
  CreateFileObjectRecordInput,
  CreateFileReferenceRecordInput,
  FilesRepository,
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
  constructor(private readonly pool: Pool) {}

  async createFileObject(input: CreateFileObjectRecordInput): Promise<FileObjectDto> {
    const result = await this.pool.query<FileObjectRow>(
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
