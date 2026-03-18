import { getRealtimeBaseUrl } from "../../../shared/config/env";
import type {
  RealtimeClientEvents,
  RealtimeClientMessage,
  RealtimeConnectParams,
  RealtimeServerMessage,
} from "./types";

interface WebSocketLike {
  readyState: number;
  close: (code?: number, reason?: string) => void;
  send: (data: string) => void;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

type WebSocketFactory = (url: string) => WebSocketLike;
type EventUnsubscribe = () => void;

interface RealtimeClientOptions {
  baseUrl?: string;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  webSocketFactory?: WebSocketFactory;
}

type RealtimeEventName = keyof RealtimeClientEvents;
type RealtimeEventListener<TKey extends RealtimeEventName> = (
  payload: RealtimeClientEvents[TKey],
) => void;

const DEFAULT_RECONNECT_BASE_DELAY_MS = 750;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 10_000;
const SOCKET_OPEN_STATE = 1;

export class RealtimeClient {
  private readonly baseUrl: string;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly webSocketFactory: WebSocketFactory;
  private readonly listeners: {
    [TKey in RealtimeEventName]: Set<RealtimeEventListener<TKey>>;
  };

  private socket: WebSocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private shouldReconnect = false;
  private currentParams: RealtimeConnectParams | null = null;

  constructor(options: RealtimeClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? getRealtimeBaseUrl()).replace(/\/$/, "");
    this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS;
    this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
    this.webSocketFactory =
      options.webSocketFactory ??
      ((url) => new WebSocket(url) as unknown as WebSocketLike);
    this.listeners = {
      open: new Set(),
      close: new Set(),
      error: new Set(),
      reconnectScheduled: new Set(),
      message: new Set(),
    };
  }

  on<TKey extends RealtimeEventName>(
    eventName: TKey,
    listener: RealtimeEventListener<TKey>,
  ): EventUnsubscribe {
    const typedListeners = this.listeners[eventName] as Set<RealtimeEventListener<TKey>>;
    typedListeners.add(listener);

    return () => {
      typedListeners.delete(listener);
    };
  }

  connect(params: RealtimeConnectParams): void {
    this.shouldReconnect = true;
    this.currentParams = params;
    this.reconnectAttempt = 0;
    this.clearReconnectTimer();
    this.openSocket(params);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.currentParams = null;
    this.reconnectAttempt = 0;
    this.clearReconnectTimer();

    if (this.socket !== null) {
      this.socket.close(1000, "manual_disconnect");
      this.socket = null;
    }
  }

  send(message: RealtimeClientMessage): void {
    if (this.socket === null || this.socket.readyState !== SOCKET_OPEN_STATE) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  private openSocket(params: RealtimeConnectParams): void {
    if (this.socket !== null) {
      this.socket.close(1000, "new_connection");
      this.socket = null;
    }

    const endpoint = `${this.baseUrl}?token=${encodeURIComponent(params.accessToken)}`;
    const socket = this.webSocketFactory(endpoint);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.emit("open", undefined);
      this.send({
        type: "subscribe",
        channel: params.channel,
      });
    };

    socket.onerror = () => {
      this.emit("error", {
        message: "Falha de conexao realtime.",
      });
    };

    socket.onmessage = (event) => {
      const parsed = this.parseServerMessage(event.data);
      if (parsed === null) {
        return;
      }
      this.emit("message", parsed);
    };

    socket.onclose = (event) => {
      this.socket = null;
      this.emit("close", {
        code: event.code ?? 1000,
        reason: event.reason ?? "socket_closed",
      });

      if (!this.shouldReconnect || this.currentParams === null) {
        return;
      }

      this.scheduleReconnect();
    };
  }

  private parseServerMessage(data: unknown): RealtimeServerMessage | null {
    if (typeof data !== "string") {
      return null;
    }

    try {
      return JSON.parse(data) as RealtimeServerMessage;
    } catch {
      return null;
    }
  }

  private scheduleReconnect(): void {
    if (this.currentParams === null) {
      return;
    }

    this.reconnectAttempt += 1;
    const delayMs = Math.min(
      this.reconnectBaseDelayMs * 2 ** (this.reconnectAttempt - 1),
      this.reconnectMaxDelayMs,
    );

    this.emit("reconnectScheduled", {
      attempt: this.reconnectAttempt,
      delayMs,
    });

    this.reconnectTimer = setTimeout(() => {
      if (this.currentParams === null || !this.shouldReconnect) {
        return;
      }

      this.openSocket(this.currentParams);
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private emit<TKey extends RealtimeEventName>(
    eventName: TKey,
    payload: RealtimeClientEvents[TKey],
  ): void {
    const typedListeners = this.listeners[eventName] as Set<RealtimeEventListener<TKey>>;
    typedListeners.forEach((listener) => {
      listener(payload);
    });
  }
}
