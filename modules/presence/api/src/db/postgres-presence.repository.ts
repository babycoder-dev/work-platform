import { Pool } from 'pg';
import type {
  CreatePresenceStatusRecordInput,
  PresenceStatusRecordDto,
  PresenceStatusTypeDto,
  PresenceStatusTypeStatus,
} from '@work/presence-contract';
import { mapPresencePostgresError } from './postgres-error.mapper';
import type {
  PresenceRepository,
  PresenceRepositoryActorContext,
  PresenceRepositoryCancelInput,
  PresenceRepositoryListActiveRecordsQuery,
  PresenceRepositoryOverlapQuery,
  PresenceStatusTypePatch,
} from './presence.repository';

interface StatusRecordRow {
  id: string;
  enterprise_id: string;
  user_id: string;
  employee_no: string;
  user_name: string;
  department_id: string;
  department_name: string;
  status: PresenceStatusRecordDto['status'];
  start_at: Date;
  end_at: Date | null;
  remark: string | null;
  created_by: string;
  created_at: Date;
  cancelled_at: Date | null;
  form_record_id: string | null;
}

interface StatusTypeRow {
  id: string;
  enterprise_id: string;
  key: string;
  label: string;
  is_preset: boolean;
  is_default: boolean;
  status: PresenceStatusTypeStatus;
  sort_order: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

const STATUS_RECORD_COLUMNS = `
  id,
  enterprise_id,
  user_id,
  employee_no,
  user_name,
  department_id,
  department_name,
  status,
  start_at,
  end_at,
  remark,
  created_by,
  created_at,
  cancelled_at,
  form_record_id
`;

const STATUS_TYPE_COLUMNS = `
  id, enterprise_id, key, label, is_preset, is_default, status, sort_order,
  created_by, created_at, updated_at
`;

export class PostgresPresenceRepository implements PresenceRepository {
  constructor(private readonly pool: Pool) {}

  async listActiveRecords(
    query: PresenceRepositoryListActiveRecordsQuery,
  ): Promise<PresenceStatusRecordDto[]> {
    const params: unknown[] = [query.enterpriseId, query.at];
    const conditions: string[] = [
      'enterprise_id = $1',
      'cancelled_at IS NULL',
      'start_at <= $2',
      '(end_at IS NULL OR end_at > $2)',
    ];

    if (query.userIds !== undefined) {
      params.push(query.userIds);
      conditions.push(`user_id = ANY($${params.length}::uuid[])`);
    }

    if (query.departmentIds !== undefined) {
      params.push(query.departmentIds);
      conditions.push(`department_id = ANY($${params.length}::uuid[])`);
    }

    if (query.status !== undefined) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }

    const result = await this.pool.query<StatusRecordRow>(
      `
        SELECT ${STATUS_RECORD_COLUMNS}
        FROM presence.status_records
        WHERE ${conditions.join(' AND ')}
        ORDER BY start_at DESC, created_at DESC
      `,
      params,
    );

    return result.rows.map(mapStatusRecord);
  }

  async listUserRecords(enterpriseId: string, userId: string): Promise<PresenceStatusRecordDto[]> {
    const result = await this.pool.query<StatusRecordRow>(
      `
        SELECT ${STATUS_RECORD_COLUMNS}
        FROM presence.status_records
        WHERE enterprise_id = $1 AND user_id = $2
        ORDER BY start_at DESC, created_at DESC
      `,
      [enterpriseId, userId],
    );

    return result.rows.map(mapStatusRecord);
  }

  async createRecord(
    input: CreatePresenceStatusRecordInput,
    actor: PresenceRepositoryActorContext,
  ): Promise<PresenceStatusRecordDto> {
    try {
      const result = await this.pool.query<StatusRecordRow>(
        `
          INSERT INTO presence.status_records (
            enterprise_id,
            user_id,
            employee_no,
            user_name,
            department_id,
            department_name,
            status,
            start_at,
            end_at,
            remark,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $2)
          RETURNING ${STATUS_RECORD_COLUMNS}
        `,
        [
          actor.enterpriseId,
          actor.userId,
          actor.employeeNo,
          actor.userName,
          actor.departmentId,
          actor.departmentName,
          input.status,
          input.startAt,
          input.endAt ?? null,
          input.remark ?? null,
        ],
      );

      return mapStatusRecord(result.rows[0]);
    } catch (error) {
      mapPresencePostgresError(error);
    }
  }

  async cancelRecord(
    input: PresenceRepositoryCancelInput,
  ): Promise<PresenceStatusRecordDto | undefined> {
    const result = await this.pool.query<StatusRecordRow>(
      `
        UPDATE presence.status_records
        SET cancelled_at = $2, updated_at = now()
        WHERE id = $1 AND cancelled_at IS NULL
        RETURNING ${STATUS_RECORD_COLUMNS}
      `,
      [input.recordId, input.cancelledAt],
    );

    const row = result.rows[0];
    return row ? mapStatusRecord(row) : undefined;
  }

  async findOverlappingRecord(
    query: PresenceRepositoryOverlapQuery,
  ): Promise<PresenceStatusRecordDto | undefined> {
    const result = await this.pool.query<StatusRecordRow>(
      `
        SELECT ${STATUS_RECORD_COLUMNS}
        FROM presence.status_records
        WHERE enterprise_id = $1
          AND user_id = $2
          AND cancelled_at IS NULL
          AND status <> $5
          AND start_at < COALESCE($4::timestamptz, 'infinity'::timestamptz)
          AND (end_at IS NULL OR end_at > $3::timestamptz)
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [query.enterpriseId, query.userId, query.startAt, query.endAt ?? null, query.exemptStatusKey],
    );

    const row = result.rows[0];
    return row ? mapStatusRecord(row) : undefined;
  }

  async ensurePresetStatusTypes(enterpriseId: string): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO presence.status_types (
          enterprise_id, key, label, is_preset, is_default, sort_order
        )
        VALUES
          ($1, 'working', '在岗', true, true, 10),
          ($1, 'business_trip', '出差', true, false, 20),
          ($1, 'field_research', '外出调研', true, false, 30),
          ($1, 'out', '外出', true, false, 40),
          ($1, 'leave', '休假', true, false, 50)
        ON CONFLICT DO NOTHING
      `,
      [enterpriseId],
    );
  }

  async listStatusTypes(
    enterpriseId: string,
    options: { includeArchived: boolean },
  ): Promise<PresenceStatusTypeDto[]> {
    const result = await this.pool.query<StatusTypeRow>(
      `
        SELECT ${STATUS_TYPE_COLUMNS}
        FROM presence.status_types
        WHERE enterprise_id = $1
          AND ($2::boolean OR status = 'active')
        ORDER BY sort_order ASC, created_at ASC
      `,
      [enterpriseId, options.includeArchived],
    );
    return result.rows.map(mapStatusType);
  }

  async findStatusTypeById(
    enterpriseId: string,
    id: string,
  ): Promise<PresenceStatusTypeDto | undefined> {
    const result = await this.pool.query<StatusTypeRow>(
      `SELECT ${STATUS_TYPE_COLUMNS} FROM presence.status_types WHERE enterprise_id = $1 AND id = $2`,
      [enterpriseId, id],
    );
    return result.rows[0] ? mapStatusType(result.rows[0]) : undefined;
  }

  async findStatusTypeByKey(
    enterpriseId: string,
    key: string,
  ): Promise<PresenceStatusTypeDto | undefined> {
    const result = await this.pool.query<StatusTypeRow>(
      `SELECT ${STATUS_TYPE_COLUMNS} FROM presence.status_types WHERE enterprise_id = $1 AND key = $2`,
      [enterpriseId, key],
    );
    return result.rows[0] ? mapStatusType(result.rows[0]) : undefined;
  }

  async createStatusType(input: {
    enterpriseId: string;
    key: string;
    label: string;
    sortOrder: number;
    createdBy: string;
  }): Promise<PresenceStatusTypeDto> {
    try {
      const result = await this.pool.query<StatusTypeRow>(
        `
          INSERT INTO presence.status_types (
            enterprise_id, key, label, sort_order, created_by
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING ${STATUS_TYPE_COLUMNS}
        `,
        [input.enterpriseId, input.key, input.label, input.sortOrder, input.createdBy],
      );
      return mapStatusType(result.rows[0]);
    } catch (error) {
      mapPresencePostgresError(error);
    }
  }

  async updateStatusType(
    enterpriseId: string,
    id: string,
    patch: PresenceStatusTypePatch,
  ): Promise<PresenceStatusTypeDto | undefined> {
    const result = await this.pool.query<StatusTypeRow>(
      `
        UPDATE presence.status_types
        SET label = CASE WHEN $3::text IS NULL THEN label ELSE $3 END,
            sort_order = CASE WHEN $4::integer IS NULL THEN sort_order ELSE $4 END,
            updated_at = now()
        WHERE enterprise_id = $1 AND id = $2
        RETURNING ${STATUS_TYPE_COLUMNS}
      `,
      [enterpriseId, id, patch.label ?? null, patch.sortOrder ?? null],
    );
    return result.rows[0] ? mapStatusType(result.rows[0]) : undefined;
  }

  async setDefaultStatusType(
    enterpriseId: string,
    id: string,
  ): Promise<PresenceStatusTypeDto | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE presence.status_types SET is_default = false, updated_at = now()
         WHERE enterprise_id = $1 AND is_default`,
        [enterpriseId],
      );
      const result = await client.query<StatusTypeRow>(
        `
          UPDATE presence.status_types
          SET is_default = true, updated_at = now()
          WHERE enterprise_id = $1 AND id = $2 AND status = 'active'
          RETURNING ${STATUS_TYPE_COLUMNS}
        `,
        [enterpriseId, id],
      );
      if (!result.rows[0]) {
        await client.query('ROLLBACK');
        return undefined;
      }
      await client.query('COMMIT');
      return mapStatusType(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      mapPresencePostgresError(error);
    } finally {
      client.release();
    }
  }

  async setStatusTypeStatus(
    enterpriseId: string,
    id: string,
    status: PresenceStatusTypeStatus,
  ): Promise<PresenceStatusTypeDto | undefined> {
    const result = await this.pool.query<StatusTypeRow>(
      `
        UPDATE presence.status_types
        SET status = $3, updated_at = now()
        WHERE enterprise_id = $1
          AND id = $2
          AND ($3 <> 'archived' OR NOT is_default)
        RETURNING ${STATUS_TYPE_COLUMNS}
      `,
      [enterpriseId, id, status],
    );
    return result.rows[0] ? mapStatusType(result.rows[0]) : undefined;
  }
}

function mapStatusRecord(row: StatusRecordRow): PresenceStatusRecordDto {
  return {
    id: row.id,
    enterpriseId: row.enterprise_id,
    userId: row.user_id,
    employeeNo: row.employee_no,
    userName: row.user_name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    status: row.status,
    startAt: row.start_at.toISOString(),
    endAt: row.end_at?.toISOString(),
    remark: row.remark ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    cancelledAt: row.cancelled_at?.toISOString(),
    formRecordId: row.form_record_id ?? undefined,
  };
}

function mapStatusType(row: StatusTypeRow): PresenceStatusTypeDto {
  return {
    id: row.id,
    enterpriseId: row.enterprise_id,
    key: row.key,
    label: row.label,
    isPreset: row.is_preset,
    isDefault: row.is_default,
    status: row.status,
    sortOrder: row.sort_order,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
