import { createHttpClient, type SseStreamHandle, type SseStreamOptions } from '@work/http-client';
import type {
  ListNotificationsQuery,
  ListNotificationsResponse,
  MarkAllNotificationsReadResponse,
  NotificationDto,
  UnreadNotificationCountResponse,
} from '@work/notification-contract';

export interface NotificationApiClient {
  listNotifications(query?: ListNotificationsQuery): Promise<ListNotificationsResponse>;
  unreadCount(): Promise<UnreadNotificationCountResponse>;
  markRead(id: string): Promise<NotificationDto>;
  markAllRead(): Promise<MarkAllNotificationsReadResponse>;
  stream(options: SseStreamOptions): SseStreamHandle;
}

export function createNotificationApiClient(options: {
  getAccessToken: () => string | undefined;
  onUnauthorized: () => void;
}): NotificationApiClient {
  const http = createHttpClient({
    baseUrl: new URL('/api/notification/', window.location.origin).toString(),
    getAccessToken: () => options.getAccessToken() ?? '',
    onUnauthorized: options.onUnauthorized,
  });

  return {
    listNotifications(query = {}) {
      return http.get<ListNotificationsResponse>('', {
        query: {
          unreadOnly: query.unreadOnly,
          limit: query.limit,
          offset: query.offset,
        },
      });
    },
    unreadCount() {
      return http.get<UnreadNotificationCountResponse>('unread-count');
    },
    markRead(id) {
      return http.put<NotificationDto>(`${encodeURIComponent(id)}/read`);
    },
    markAllRead() {
      return http.put<MarkAllNotificationsReadResponse>('read-all');
    },
    stream(streamOptions) {
      return http.stream('stream', streamOptions);
    },
  };
}
