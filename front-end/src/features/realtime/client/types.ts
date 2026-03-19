export interface RealtimeNotificationMessage {
  type: "notification";
  id: string;
  title: string;
  body: string;
  created_at: string;
  tenant_id?: string | null;
  patient_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  status?: string | null;
  category?: string | null;
  event_type?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RealtimeConnectedMessage {
  type: "connected";
  at: string;
}

export interface RealtimeErrorMessage {
  type: "error";
  message: string;
}

export interface RealtimePongMessage {
  type: "pong";
}

export type RealtimeServerMessage =
  | RealtimeNotificationMessage
  | RealtimeConnectedMessage
  | RealtimeErrorMessage
  | RealtimePongMessage;

export interface RealtimeSubscribeMessage {
  type: "subscribe";
  channel: string;
}

export interface RealtimePingMessage {
  type: "ping";
}

export type RealtimeClientMessage = RealtimeSubscribeMessage | RealtimePingMessage;

export interface RealtimeConnectParams {
  accessToken: string;
  channel: string;
}

export interface RealtimeClientEvents {
  open: void;
  close: {
    code: number;
    reason: string;
  };
  error: {
    message: string;
  };
  reconnectScheduled: {
    attempt: number;
    delayMs: number;
  };
  message: RealtimeServerMessage;
}
