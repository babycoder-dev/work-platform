import { act, renderHook } from '@testing-library/react';
import { notificationEvents, type NotificationDto } from '@work/notification-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationApiClient } from '../platform/notification-api';
import { useNotifications } from './use-notifications';

const notification: NotificationDto = {
  id: 'notification-001',
  recipientUserId: 'user-001',
  title: '在位状态变更',
  content: '有成员更新了在位状态',
  sourceModule: 'presence',
  sourceId: 'presence-001',
  channel: 'in_app',
  createdAt: '2026-06-16T00:00:00.000Z',
};

describe('useNotifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes on notification.created and ignores keepalive', async () => {
    const api = createApi();
    let onMessage!: (data: unknown) => void;
    api.stream.mockImplementation((options) => {
      onMessage = options.onMessage;
      options.onOpen?.();
      return { close: vi.fn() };
    });
    api.unreadCount.mockResolvedValue({ count: 1 });
    api.listNotifications.mockResolvedValue({ items: [notification], total: 1 });

    renderHook(() => useNotifications(api));
    await flushPromises();
    expect(api.unreadCount).toHaveBeenCalledTimes(1);

    act(() => onMessage({ type: 'keepalive' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(api.unreadCount).toHaveBeenCalledTimes(1);

    act(() => onMessage({ type: notificationEvents.notificationCreated }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushPromises();
    expect(api.unreadCount).toHaveBeenCalledTimes(2);
    expect(api.listNotifications).toHaveBeenCalledTimes(2);
  });

  it('falls back to polling and schedules reconnect on stream errors', async () => {
    const api = createApi();
    let onError!: () => void;
    const close = vi.fn();
    api.stream.mockImplementation((options) => {
      onError = options.onError ?? vi.fn();
      if (api.stream.mock.calls.length === 1) {
        options.onOpen?.();
      }
      return { close };
    });
    api.unreadCount.mockResolvedValue({ count: 0 });
    api.listNotifications.mockResolvedValue({ items: [], total: 0 });

    const { result } = renderHook(() => useNotifications(api));
    await flushPromises();
    expect(result.current.status).toBe('live');

    act(() => onError());
    expect(result.current.status).toBe('polling');
    expect(close).toHaveBeenCalled();
    await flushPromises();
    expect(api.unreadCount).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(api.stream).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(55_000);
    });
    expect(api.unreadCount).toHaveBeenCalledTimes(3);
  });

  it('increments reconnect backoff after consecutive stream errors', async () => {
    const api = createApi();
    const streamErrors: Array<() => void> = [];
    api.stream.mockImplementation((options) => {
      streamErrors.push(options.onError ?? vi.fn());
      if (api.stream.mock.calls.length === 1) {
        options.onOpen?.();
      }
      return { close: vi.fn() };
    });
    api.unreadCount.mockResolvedValue({ count: 0 });
    api.listNotifications.mockResolvedValue({ items: [], total: 0 });

    renderHook(() => useNotifications(api));
    await flushPromises();

    act(() => streamErrors[0]());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(api.stream).toHaveBeenCalledTimes(2);

    act(() => streamErrors[1]());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999);
    });
    expect(api.stream).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(api.stream).toHaveBeenCalledTimes(3);
  });

  it('rolls back optimistic markRead updates when the request fails', async () => {
    const api = createApi();
    const markReadFailure = createDeferred<void>();
    api.stream.mockReturnValue({ close: vi.fn() });
    api.unreadCount.mockResolvedValue({ count: 1 });
    api.listNotifications.mockResolvedValue({ items: [notification], total: 1 });
    api.markRead.mockReturnValue(markReadFailure.promise);

    const { result } = renderHook(() => useNotifications(api));
    await flushPromises();
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.recent[0].readAt).toBeUndefined();

    let markReadPromise!: Promise<void>;
    act(() => {
      markReadPromise = result.current.markRead(notification);
    });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.recent[0].readAt).toBeDefined();

    await act(async () => {
      markReadFailure.reject(new Error('mark read failed'));
      await expect(markReadPromise).rejects.toThrow('mark read failed');
    });

    expect(result.current.unreadCount).toBe(1);
    expect(result.current.recent[0].readAt).toBeUndefined();
  });

  it('rolls back optimistic markAllRead updates when the request fails', async () => {
    const api = createApi();
    const markAllReadFailure = createDeferred<void>();
    api.stream.mockReturnValue({ close: vi.fn() });
    api.unreadCount.mockResolvedValue({ count: 1 });
    api.listNotifications.mockResolvedValue({ items: [notification], total: 1 });
    api.markAllRead.mockReturnValue(markAllReadFailure.promise);

    const { result } = renderHook(() => useNotifications(api));
    await flushPromises();
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.recent[0].readAt).toBeUndefined();

    let markAllReadPromise!: Promise<void>;
    act(() => {
      markAllReadPromise = result.current.markAllRead();
    });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.recent[0].readAt).toBeDefined();

    await act(async () => {
      markAllReadFailure.reject(new Error('mark all read failed'));
      await expect(markAllReadPromise).rejects.toThrow('mark all read failed');
    });

    expect(result.current.unreadCount).toBe(1);
    expect(result.current.recent[0].readAt).toBeUndefined();
  });

  it('cleans stream and timers on unmount', async () => {
    const api = createApi();
    const close = vi.fn();
    api.stream.mockReturnValue({ close });
    api.unreadCount.mockResolvedValue({ count: 0 });
    api.listNotifications.mockResolvedValue({ items: [], total: 0 });

    const { unmount } = renderHook(() => useNotifications(api));
    await flushPromises();
    expect(api.stream).toHaveBeenCalledTimes(1);
    unmount();

    expect(close).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(api.unreadCount).toHaveBeenCalledTimes(1);
  });
});

function createApi() {
  return {
    listNotifications: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    stream: vi.fn(),
  } as unknown as MockNotificationApiClient;
}

type MockNotificationApiClient = {
  [K in keyof NotificationApiClient]: NotificationApiClient[K] & ReturnType<typeof vi.fn>;
};

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}
