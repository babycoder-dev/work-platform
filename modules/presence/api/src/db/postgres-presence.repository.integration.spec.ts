import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readPresenceDatabaseConfig } from './db.config';
import { runPresenceMigrations } from './migrate';
import { PostgresPresenceRepository } from './postgres-presence.repository';
import type { PresenceRepositoryActorContext } from './presence.repository';

const runPostgresIntegration = process.env.RUN_POSTGRES_INTEGRATION === 'true';

describe.skipIf(!runPostgresIntegration)('PostgresPresenceRepository integration', () => {
  let pool: Pool;
  let repository: PostgresPresenceRepository;
  let enterpriseId: string;
  let userOneId: string;
  let userTwoId: string;
  let deptOneId: string;
  let deptTwoId: string;

  function actor(overrides: Partial<PresenceRepositoryActorContext> = {}): PresenceRepositoryActorContext {
    return {
      enterpriseId,
      userId: userOneId,
      employeeNo: 'EMP1',
      userName: '张三',
      departmentId: deptOneId,
      departmentName: '研发部',
      ...overrides,
    };
  }

  beforeAll(async () => {
    await runPresenceMigrations();

    const config = readPresenceDatabaseConfig();
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    });
    repository = new PostgresPresenceRepository(pool);

    enterpriseId = randomUUID();
    userOneId = randomUUID();
    userTwoId = randomUUID();
    deptOneId = randomUUID();
    deptTwoId = randomUUID();
  });

  afterAll(async () => {
    if (pool && enterpriseId) {
      await pool.query('DELETE FROM presence.status_records WHERE enterprise_id = $1', [enterpriseId]);
    }
    await pool?.end();
  });

  it('creates a record, lists it as active, then lets cancelRecord exclude it', async () => {
    const created = await repository.createRecord(
      { status: 'business_trip', startAt: '2026-05-25T08:00:00.000Z', endAt: '2026-05-25T18:00:00.000Z', remark: '客户拜访' },
      actor(),
    );

    expect(created).toMatchObject({
      enterpriseId,
      userId: userOneId,
      employeeNo: 'EMP1',
      userName: '张三',
      departmentId: deptOneId,
      departmentName: '研发部',
      status: 'business_trip',
      remark: '客户拜访',
      createdBy: userOneId,
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const active = await repository.listActiveRecords({
      enterpriseId,
      at: '2026-05-25T12:00:00.000Z',
    });
    expect(active.map((record) => record.id)).toContain(created.id);

    const cancelled = await repository.cancelRecord({
      recordId: created.id,
      actorUserId: userOneId,
      cancelledAt: '2026-05-25T09:00:00.000Z',
    });
    expect(cancelled?.cancelledAt).toBe('2026-05-25T09:00:00.000Z');

    const activeAfterCancel = await repository.listActiveRecords({
      enterpriseId,
      at: '2026-05-25T12:00:00.000Z',
    });
    expect(activeAfterCancel.map((record) => record.id)).not.toContain(created.id);
  });

  it('cancelRecord returns undefined for already-cancelled records', async () => {
    const created = await repository.createRecord(
      { status: 'out', startAt: '2026-05-26T08:00:00.000Z' },
      actor({ userId: userTwoId, employeeNo: 'EMP2', userName: '李四', departmentId: deptTwoId, departmentName: '产品部' }),
    );

    const firstCancel = await repository.cancelRecord({
      recordId: created.id,
      actorUserId: userTwoId,
      cancelledAt: '2026-05-26T09:00:00.000Z',
    });
    expect(firstCancel?.cancelledAt).toBe('2026-05-26T09:00:00.000Z');

    const secondCancel = await repository.cancelRecord({
      recordId: created.id,
      actorUserId: userTwoId,
      cancelledAt: '2026-05-26T10:00:00.000Z',
    });
    expect(secondCancel).toBeUndefined();
  });

  it('filters active records by departmentIds, userIds, and status', async () => {
    await repository.createRecord(
      { status: 'business_trip', startAt: '2026-05-27T08:00:00.000Z', endAt: '2026-05-27T18:00:00.000Z' },
      actor(),
    );
    await repository.createRecord(
      { status: 'leave', startAt: '2026-05-27T08:00:00.000Z', endAt: '2026-05-27T18:00:00.000Z' },
      actor({ userId: userTwoId, employeeNo: 'EMP2', userName: '李四', departmentId: deptTwoId, departmentName: '产品部' }),
    );

    const byDept = await repository.listActiveRecords({
      enterpriseId,
      at: '2026-05-27T12:00:00.000Z',
      departmentIds: [deptOneId],
    });
    expect(byDept.map((record) => record.userId)).toEqual(expect.arrayContaining([userOneId]));
    expect(byDept.map((record) => record.userId)).not.toContain(userTwoId);

    const byUser = await repository.listActiveRecords({
      enterpriseId,
      at: '2026-05-27T12:00:00.000Z',
      userIds: [userTwoId],
    });
    expect(byUser.map((record) => record.userId)).toEqual([userTwoId]);

    const byStatus = await repository.listActiveRecords({
      enterpriseId,
      at: '2026-05-27T12:00:00.000Z',
      status: 'leave',
    });
    expect(byStatus.every((record) => record.status === 'leave')).toBe(true);
  });

  it('listUserRecords returns the user history sorted by start desc including cancelled rows', async () => {
    const user = randomUUID();
    await repository.createRecord(
      { status: 'business_trip', startAt: '2026-05-20T00:00:00.000Z', endAt: '2026-05-20T08:00:00.000Z' },
      actor({ userId: user, employeeNo: 'EMPX', userName: '历史用户' }),
    );
    const second = await repository.createRecord(
      { status: 'leave', startAt: '2026-05-25T00:00:00.000Z' },
      actor({ userId: user, employeeNo: 'EMPX', userName: '历史用户' }),
    );
    await repository.cancelRecord({
      recordId: second.id,
      actorUserId: user,
      cancelledAt: '2026-05-25T01:00:00.000Z',
    });

    const history = await repository.listUserRecords(enterpriseId, user);
    expect(history).toHaveLength(2);
    expect(history[0].startAt).toBe('2026-05-25T00:00:00.000Z');
    expect(history[0].cancelledAt).toBe('2026-05-25T01:00:00.000Z');
  });

  it('findOverlappingRecord ignores cancelled and working records and treats undefined endAt as open-ended', async () => {
    const user = randomUUID();
    await repository.createRecord(
      { status: 'business_trip', startAt: '2026-06-01T08:00:00.000Z', endAt: '2026-06-01T18:00:00.000Z' },
      actor({ userId: user, employeeNo: 'EMPY', userName: '重叠测试用户' }),
    );
    const cancelled = await repository.createRecord(
      { status: 'leave', startAt: '2026-06-01T10:00:00.000Z' },
      actor({ userId: user, employeeNo: 'EMPY', userName: '重叠测试用户' }),
    );
    await repository.cancelRecord({
      recordId: cancelled.id,
      actorUserId: user,
      cancelledAt: '2026-06-01T10:30:00.000Z',
    });
    await repository.createRecord(
      { status: 'working', startAt: '2026-06-01T09:00:00.000Z', endAt: '2026-06-01T19:00:00.000Z' },
      actor({ userId: user, employeeNo: 'EMPY', userName: '重叠测试用户' }),
    );

    const overlap = await repository.findOverlappingRecord({
      enterpriseId,
      userId: user,
      startAt: '2026-06-01T14:00:00.000Z',
      endAt: '2026-06-01T16:00:00.000Z',
    });
    expect(overlap?.status).toBe('business_trip');

    const openEnded = await repository.createRecord(
      { status: 'leave', startAt: '2026-07-01T00:00:00.000Z' },
      actor({ userId: user, employeeNo: 'EMPY', userName: '重叠测试用户' }),
    );
    const openOverlap = await repository.findOverlappingRecord({
      enterpriseId,
      userId: user,
      startAt: '2026-08-01T00:00:00.000Z',
    });
    expect(openOverlap?.id).toBe(openEnded.id);
  });

  it('rejects records whose time range fails the check constraint', async () => {
    await expect(
      repository.createRecord(
        { status: 'business_trip', startAt: '2026-05-25T18:00:00.000Z', endAt: '2026-05-25T08:00:00.000Z' },
        actor(),
      ),
    ).rejects.toMatchObject({ code: 'PRESENCE_INVALID_STATE', status: 400 });
  });
});
