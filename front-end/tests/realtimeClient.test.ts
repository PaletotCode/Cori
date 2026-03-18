import { RealtimeClient } from "../src/features/realtime/client/realtimeClient";

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readonly sentPayloads: string[] = [];
  readonly close = jest.fn((code?: number, reason?: string) => {
    this.readyState = 3;
    this.onclose?.({
      code,
      reason,
    });
  });
  readonly send = jest.fn((payload: string) => {
    this.sentPayloads.push(payload);
  });

  readonly url: string;
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  closeFromServer(code = 1006, reason = "abnormal_close"): void {
    this.readyState = 3;
    this.onclose?.({
      code,
      reason,
    });
  }
}

describe("realtime client", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("subscribes to tenant channel on connection open", () => {
    const client = new RealtimeClient({
      baseUrl: "ws://localhost:8000/ws",
      webSocketFactory: (url) => new MockWebSocket(url),
      reconnectBaseDelayMs: 10,
      reconnectMaxDelayMs: 40,
    });

    const onOpen = jest.fn();
    client.on("open", onOpen);

    client.connect({
      accessToken: "token-1",
      channel: "tenant:1",
    });

    const socket = MockWebSocket.instances[0];
    expect(socket.url).toBe("ws://localhost:8000/ws?token=token-1");

    socket.open();

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "subscribe",
        channel: "tenant:1",
      }),
    );
  });

  it("schedules reconnect after unexpected close", () => {
    const client = new RealtimeClient({
      baseUrl: "ws://localhost:8000/ws",
      webSocketFactory: (url) => new MockWebSocket(url),
      reconnectBaseDelayMs: 10,
      reconnectMaxDelayMs: 40,
    });

    const onReconnect = jest.fn();
    client.on("reconnectScheduled", onReconnect);

    client.connect({
      accessToken: "token-2",
      channel: "tenant:2",
    });

    const firstSocket = MockWebSocket.instances[0];
    firstSocket.open();
    firstSocket.closeFromServer(1006, "network_drop");

    expect(onReconnect).toHaveBeenCalledWith({
      attempt: 1,
      delayMs: 10,
    });

    jest.advanceTimersByTime(10);

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[1].url).toBe("ws://localhost:8000/ws?token=token-2");
  });
});
