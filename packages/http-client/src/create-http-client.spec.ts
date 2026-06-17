import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpClient } from './create-http-client';

describe('createHttpClient stream', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('streams SSE frames with bearer auth and keeps token out of the URL', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('data: {"type":"notification.created"}\n\n'));
        controller.enqueue(encode('data: {"type":"notification.created"}\n\n'));
        controller.close();
      },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(stream));
    const onMessage = vi.fn();
    const onOpen = vi.fn();

    createHttpClient({
      baseUrl: 'https://example.test/api/notification/',
      getAccessToken: () => 'secret-token',
    }).stream('stream', { onMessage, onOpen });

    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledTimes(2));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://example.test/api/notification/stream');
    expect(url.toString()).not.toContain('secret-token');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
    expect((init.headers as Record<string, string>).Accept).toBe('text/event-stream');
    expect(onMessage).toHaveBeenNthCalledWith(1, { type: 'notification.created' });
  });

  it('does not call onError when the handle is closed', async () => {
    let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controllerRef = controller;
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(stream));
    const onMessage = vi.fn();
    const onError = vi.fn();

    const handle = createHttpClient({
      baseUrl: 'https://example.test/api/notification/',
      getAccessToken: () => 'secret-token',
    }).stream('stream', { onMessage, onError });

    await vi.waitFor(() => expect(controllerRef).toBeDefined());
    handle.close();
    controllerRef.enqueue(encode('data: {"type":"notification.created"}\n\n'));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onMessage).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onUnauthorized on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }));
    const onUnauthorized = vi.fn();
    const onError = vi.fn();

    createHttpClient({
      baseUrl: 'https://example.test/api/notification/',
      getAccessToken: () => 'secret-token',
      onUnauthorized,
    }).stream('stream', { onMessage: vi.fn(), onError });

    await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('calls onError for stream read failures', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('reader failed');
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(stream));
    const onError = vi.fn();

    createHttpClient({
      baseUrl: 'https://example.test/api/notification/',
      getAccessToken: () => 'secret-token',
    }).stream('stream', { onMessage: vi.fn(), onError });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('removes the external abort listener when closed', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start() {
        // Keep the stream open until the handle is closed.
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(stream));
    const externalController = new AbortController();
    const addEventListener = vi.spyOn(externalController.signal, 'addEventListener');
    const removeEventListener = vi.spyOn(externalController.signal, 'removeEventListener');

    const handle = createHttpClient({
      baseUrl: 'https://example.test/api/notification/',
      getAccessToken: () => 'secret-token',
    }).stream('stream', { onMessage: vi.fn(), signal: externalController.signal });

    await vi.waitFor(() => expect(addEventListener).toHaveBeenCalledWith('abort', expect.any(Function), { once: true }));
    handle.close();

    expect(removeEventListener).toHaveBeenCalledWith('abort', addEventListener.mock.calls[0][1]);
  });
});

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function response(body: ReadableStream<Uint8Array>): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
