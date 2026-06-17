import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationEvents, type NotificationDto } from '@work/notification-contract';
import type { SseStreamHandle } from '@work/http-client';
import type { NotificationApiClient } from '../platform/notification-api';

const RECENT_LIMIT = 10;
const POLL_INTERVAL_MS = 60_000;
const REFRESH_DEBOUNCE_MS = 300;
const RECONNECT_DELAYS_MS = [5_000, 15_000, 30_000] as const;

export interface NotificationsState {
  unreadCount: number;
  recent: NotificationDto[];
  status: 'live' | 'polling';
  refresh(): Promise<void>;
  markRead(notification: NotificationDto): Promise<void>;
  markAllRead(): Promise<void>;
}

export function useNotifications(api: NotificationApiClient): NotificationsState {
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState<NotificationDto[]>([]);
  const [status, setStatus] = useState<'live' | 'polling'>('polling');
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);

  const refresh = useCallback(async () => {
    const [countResponse, listResponse] = await Promise.all([
      api.unreadCount(),
      api.listNotifications({ limit: RECENT_LIMIT }),
    ]);
    setUnreadCount(countResponse.count);
    setRecent(listResponse.items);
  }, [api]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let disposed = false;
    let handle: SseStreamHandle | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempt = 0;

    function safeRefresh() {
      void refreshRef.current().catch(() => undefined);
    }

    function clearPollTimer() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    }

    function clearReconnectTimer() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
    }

    function clearRefreshTimer() {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = undefined;
      }
    }

    function scheduleRefresh() {
      clearRefreshTimer();
      refreshTimer = setTimeout(() => {
        if (!disposed) {
          safeRefresh();
        }
      }, REFRESH_DEBOUNCE_MS);
    }

    function startPolling() {
      if (!pollTimer) {
        pollTimer = setInterval(() => {
          safeRefresh();
        }, POLL_INTERVAL_MS);
      }
      setStatus('polling');
    }

    function scheduleReconnect() {
      clearReconnectTimer();
      const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        connect();
      }, delay);
    }

    function enterFallback() {
      if (disposed) {
        return;
      }
      handle?.close();
      handle = undefined;
      startPolling();
      safeRefresh();
      scheduleReconnect();
    }

    function connect() {
      if (disposed) {
        return;
      }
      handle?.close();
      handle = api.stream({
        onOpen() {
          if (disposed) {
            return;
          }
          reconnectAttempt = 0;
          clearPollTimer();
          clearReconnectTimer();
          setStatus('live');
        },
        onMessage(data) {
          if (isNotificationCreatedSignal(data)) {
            scheduleRefresh();
          }
        },
        onError() {
          enterFallback();
        },
      });
    }

    safeRefresh();
    connect();

    return () => {
      disposed = true;
      handle?.close();
      clearPollTimer();
      clearReconnectTimer();
      clearRefreshTimer();
    };
  }, [api]);

  const markRead = useCallback(
    async (notification: NotificationDto) => {
      const previousCount = unreadCount;
      const previousRecent = recent;
      setRecent((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item)),
      );
      if (!notification.readAt) {
        setUnreadCount((current) => Math.max(0, current - 1));
      }
      try {
        await api.markRead(notification.id);
        await refresh();
      } catch (error) {
        setUnreadCount(previousCount);
        setRecent(previousRecent);
        throw error;
      }
    },
    [api, recent, refresh, unreadCount],
  );

  const markAllRead = useCallback(async () => {
    const previousCount = unreadCount;
    const previousRecent = recent;
    const readAt = new Date().toISOString();
    setUnreadCount(0);
    setRecent((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
    try {
      await api.markAllRead();
      await refresh();
    } catch (error) {
      setUnreadCount(previousCount);
      setRecent(previousRecent);
      throw error;
    }
  }, [api, recent, refresh, unreadCount]);

  return { unreadCount, recent, status, refresh, markRead, markAllRead };
}

function isNotificationCreatedSignal(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as { type?: unknown }).type === notificationEvents.notificationCreated
  );
}
