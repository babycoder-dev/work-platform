import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type {
  CreateNotificationRecordInput,
  NotificationRepository,
} from './notification.repository';
import type { NotificationRecord } from './schema/notification.schema';

interface NotificationRow {
  id: string;
  recipient_user_id: string;
  title: string;
  content: string;
  source_module: string | null;
  source_id: string | null;
  channel: NotificationRecord['channel'];
  read_at: Date | null;
  created_at: Date;
}

@Injectable()
export class PostgresNotificationRepository implements NotificationRepository {
  constructor(private readonly pool: Pool) {}

  async createMany(items: CreateNotificationRecordInput[]): Promise<NotificationRecord[]> {
    if (items.length === 0) {
      return [];
    }

    const values: unknown[] = [];
    const rowsSql = items
      .map((item, index) => {
        const offset = index * 8;
        values.push(
          item.id,
          item.recipientUserId,
          item.title,
          item.content,
          item.sourceModule ?? null,
          item.sourceId ?? null,
          item.channel,
          item.createdAt,
        );
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`;
      })
      .join(', ');

    const result = await this.pool.query<NotificationRow>(
      `
        INSERT INTO notification.notification (
          id, recipient_user_id, title, content, source_module, source_id, channel, created_at
        )
        VALUES ${rowsSql}
        RETURNING *
      `,
      values,
    );

    return result.rows.map(mapRow);
  }

  async listByRecipient(
    recipientUserId: string,
    query: { limit: number; offset: number; unreadOnly?: boolean },
  ) {
    const unreadSql = query.unreadOnly ? 'AND read_at IS NULL' : '';
    const [itemsResult, countResult] = await Promise.all([
      this.pool.query<NotificationRow>(
        `
          SELECT *
          FROM notification.notification
          WHERE recipient_user_id = $1 ${unreadSql}
          ORDER BY created_at DESC, id DESC
          LIMIT $2 OFFSET $3
        `,
        [recipientUserId, query.limit, query.offset],
      ),
      this.pool.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM notification.notification
          WHERE recipient_user_id = $1 ${unreadSql}
        `,
        [recipientUserId],
      ),
    ]);

    return {
      items: itemsResult.rows.map(mapRow),
      total: Number(countResult.rows[0]?.count ?? 0),
    };
  }

  async countUnread(recipientUserId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM notification.notification
        WHERE recipient_user_id = $1 AND read_at IS NULL
      `,
      [recipientUserId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async markRead(
    recipientUserId: string,
    id: string,
    readAt: Date,
  ): Promise<NotificationRecord | undefined> {
    const result = await this.pool.query<NotificationRow>(
      `
        UPDATE notification.notification
        SET read_at = COALESCE(read_at, $3)
        WHERE recipient_user_id = $1 AND id = $2
        RETURNING *
      `,
      [recipientUserId, id, readAt],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async markAllRead(recipientUserId: string, readAt: Date): Promise<number> {
    const result = await this.pool.query<{ id: string }>(
      `
        UPDATE notification.notification
        SET read_at = $2
        WHERE recipient_user_id = $1 AND read_at IS NULL
        RETURNING id
      `,
      [recipientUserId, readAt],
    );
    return result.rowCount ?? 0;
  }
}

function mapRow(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    recipientUserId: row.recipient_user_id,
    title: row.title,
    content: row.content,
    sourceModule: row.source_module ?? undefined,
    sourceId: row.source_id ?? undefined,
    channel: row.channel,
    readAt: row.read_at ?? undefined,
    createdAt: row.created_at,
  };
}
