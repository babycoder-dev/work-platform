import { Pool } from 'pg';
import type {
  CreatePresenceStatusRecordInput,
  PresenceStatusRecordDto,
} from '@work/presence-contract';
import { mapPresencePostgresError } from './postgres-error.mapper';
import type {
  PresenceRepository,
  PresenceRepositoryActorContext,
  PresenceRepositoryCancelInput,
  PresenceRepositoryListActiveRecordsQuery,
  PresenceRepositoryOverlapQuery,
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
  cancelled_at
`;

export class PostgresPresenceRepository implements PresenceRepository {
  constructor(private readonly pool: Pool) {}

  async listActiveRecords(query: PresenceRepositoryListActiveRecordsQuery): Promise<PresenceStatusRecordDto[]> {
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

  async cancelRecord(input: PresenceRepositoryCancelInput): Promise<PresenceStatusRecordDto | undefined> {
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

  async findOverlappingRecord(query: PresenceRepositoryOverlapQuery): Promise<PresenceStatusRecordDto | undefined> {
    const result = await this.pool.query<StatusRecordRow>(
      `
        SELECT ${STATUS_RECORD_COLUMNS}
        FROM presence.status_records
        WHERE enterprise_id = $1
          AND user_id = $2
          AND cancelled_at IS NULL
          AND status <> 'working'
          AND start_at < COALESCE($4::timestamptz, 'infinity'::timestamptz)
          AND (end_at IS NULL OR end_at > $3::timestamptz)
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [query.enterpriseId, query.userId, query.startAt, query.endAt ?? null],
    );

    const row = result.rows[0];
    return row ? mapStatusRecord(row) : undefined;
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
  };
}
