import { describe, expect, it } from 'vitest';
import { InMemoryPresenceRepository } from './in-memory-presence.repository';
import type { PresenceRepositoryActorContext } from './presence.repository';

const ACTOR: PresenceRepositoryActorContext = {
  enterpriseId: 'ent-1',
  userId: 'user-1',
  employeeNo: 'EMP1',
  userName: '张三',
  departmentId: 'dept-1',
  departmentName: '研发部',
};

const OTHER_USER_ACTOR: PresenceRepositoryActorContext = {
  ...ACTOR,
  userId: 'user-2',
  employeeNo: 'EMP2',
  userName: '李四',
  departmentId: 'dept-2',
  departmentName: '产品部',
};

describe('InMemoryPresenceRepository', () => {
  it('returns active records filtered by enterprise, time window, and scope', async () => {
    const repo = new InMemoryPresenceRepository();
    await repo.createRecord(
      { status: 'business_trip', startAt: '2026-05-25T08:00:00.000Z', endAt: '2026-05-25T18:00:00.000Z' },
      ACTOR,
    );
    await repo.createRecord(
      { status: 'leave', startAt: '2026-05-25T00:00:00.000Z' },
      OTHER_USER_ACTOR,
    );
    await repo.createRecord(
      { status: 'out', startAt: '2026-05-30T08:00:00.000Z', endAt: '2026-05-30T18:00:00.000Z' },
      ACTOR,
    );

    const active = await repo.listActiveRecords({
      enterpriseId: 'ent-1',
      at: '2026-05-25T12:00:00.000Z',
    });

    expect(active).toHaveLength(2);
    expect(active.map((record) => record.userId).sort()).toEqual(['user-1', 'user-2']);
  });

  it('filters active records by departmentIds and status', async () => {
    const repo = new InMemoryPresenceRepository();
    await repo.createRecord(
      { status: 'business_trip', startAt: '2026-05-25T08:00:00.000Z', endAt: '2026-05-25T18:00:00.000Z' },
      ACTOR,
    );
    await repo.createRecord(
      { status: 'leave', startAt: '2026-05-25T08:00:00.000Z' },
      OTHER_USER_ACTOR,
    );

    const byDepartment = await repo.listActiveRecords({
      enterpriseId: 'ent-1',
      at: '2026-05-25T12:00:00.000Z',
      departmentIds: ['dept-1'],
    });
    expect(byDepartment.map((record) => record.userId)).toEqual(['user-1']);

    const byStatus = await repo.listActiveRecords({
      enterpriseId: 'ent-1',
      at: '2026-05-25T12:00:00.000Z',
      status: 'leave',
    });
    expect(byStatus.map((record) => record.userId)).toEqual(['user-2']);
  });

  it('excludes cancelled records and records that ended on or before query time', async () => {
    const repo = new InMemoryPresenceRepository();
    const created = await repo.createRecord(
      { status: 'business_trip', startAt: '2026-05-25T08:00:00.000Z', endAt: '2026-05-25T18:00:00.000Z' },
      ACTOR,
    );
    await repo.cancelRecord({
      recordId: created.id,
      actorUserId: ACTOR.userId,
      cancelledAt: '2026-05-25T09:00:00.000Z',
    });

    const active = await repo.listActiveRecords({
      enterpriseId: 'ent-1',
      at: '2026-05-25T12:00:00.000Z',
    });

    expect(active).toEqual([]);
  });

  it('returns user records sorted by start desc including cancelled ones', async () => {
    const repo = new InMemoryPresenceRepository();
    await repo.createRecord(
      { status: 'business_trip', startAt: '2026-05-20T00:00:00.000Z', endAt: '2026-05-20T08:00:00.000Z' },
      ACTOR,
    );
    const second = await repo.createRecord(
      { status: 'leave', startAt: '2026-05-25T00:00:00.000Z' },
      ACTOR,
    );
    await repo.cancelRecord({
      recordId: second.id,
      actorUserId: ACTOR.userId,
      cancelledAt: '2026-05-25T01:00:00.000Z',
    });

    const records = await repo.listUserRecords('ent-1', 'user-1');
    expect(records).toHaveLength(2);
    expect(records[0].startAt).toBe('2026-05-25T00:00:00.000Z');
    expect(records[0].cancelledAt).toBe('2026-05-25T01:00:00.000Z');
  });

  it('cancelRecord returns undefined for unknown or already-cancelled records', async () => {
    const repo = new InMemoryPresenceRepository();
    const created = await repo.createRecord(
      { status: 'business_trip', startAt: '2026-05-25T08:00:00.000Z' },
      ACTOR,
    );
    const firstCancel = await repo.cancelRecord({
      recordId: created.id,
      actorUserId: ACTOR.userId,
      cancelledAt: '2026-05-25T09:00:00.000Z',
    });
    expect(firstCancel?.cancelledAt).toBe('2026-05-25T09:00:00.000Z');

    const secondCancel = await repo.cancelRecord({
      recordId: created.id,
      actorUserId: ACTOR.userId,
      cancelledAt: '2026-05-25T10:00:00.000Z',
    });
    expect(secondCancel).toBeUndefined();

    const unknown = await repo.cancelRecord({
      recordId: '00000000-0000-0000-0000-000000000000',
      actorUserId: ACTOR.userId,
      cancelledAt: '2026-05-25T09:00:00.000Z',
    });
    expect(unknown).toBeUndefined();
  });

  it('findOverlappingRecord ignores working and cancelled records, returns latest overlap', async () => {
    const repo = new InMemoryPresenceRepository();
    await repo.createRecord(
      { status: 'business_trip', startAt: '2026-05-25T08:00:00.000Z', endAt: '2026-05-25T18:00:00.000Z' },
      ACTOR,
    );
    const cancelled = await repo.createRecord(
      { status: 'leave', startAt: '2026-05-25T10:00:00.000Z' },
      ACTOR,
    );
    await repo.cancelRecord({
      recordId: cancelled.id,
      actorUserId: ACTOR.userId,
      cancelledAt: '2026-05-25T10:30:00.000Z',
    });
    await repo.createRecord(
      { status: 'working', startAt: '2026-05-25T09:00:00.000Z', endAt: '2026-05-25T19:00:00.000Z' },
      ACTOR,
    );

    const overlap = await repo.findOverlappingRecord({
      enterpriseId: 'ent-1',
      userId: 'user-1',
      startAt: '2026-05-25T14:00:00.000Z',
      endAt: '2026-05-25T16:00:00.000Z',
    });

    expect(overlap?.status).toBe('business_trip');

    const noOverlap = await repo.findOverlappingRecord({
      enterpriseId: 'ent-1',
      userId: 'user-1',
      startAt: '2026-05-26T08:00:00.000Z',
      endAt: '2026-05-26T18:00:00.000Z',
    });
    expect(noOverlap).toBeUndefined();
  });

  it('open-ended overlap query treats undefined endAt as infinity', async () => {
    const repo = new InMemoryPresenceRepository();
    await repo.createRecord(
      { status: 'leave', startAt: '2026-05-25T00:00:00.000Z' },
      ACTOR,
    );

    const overlap = await repo.findOverlappingRecord({
      enterpriseId: 'ent-1',
      userId: 'user-1',
      startAt: '2026-06-01T00:00:00.000Z',
    });
    expect(overlap?.status).toBe('leave');
  });
});
