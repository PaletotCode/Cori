import { createStore } from "../../../shared/store/createStore";
import { notificationsStore } from "../../notifications/store/notificationsStore";
import { RealtimeClient } from "../client/realtimeClient";
import type { RealtimeConnectParams } from "../client/types";

export type RealtimeConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export interface RealtimeState {
  status: RealtimeConnectionStatus;
  retryCount: number;
  channel: string | null;
  lastConnectedAt: string | null;
  lastEventType: string | null;
  lastError: string | null;
}

const initialRealtimeState: RealtimeState = {
  status: "idle",
  retryCount: 0,
  channel: null,
  lastConnectedAt: null,
  lastEventType: null,
  lastError: null,
};

const realtimeClient = new RealtimeClient();
const baseStore = createStore<RealtimeState>(initialRealtimeState);

realtimeClient.on("open", () => {
  baseStore.setState((previous) => ({
    ...previous,
    status: "connected",
    retryCount: 0,
    lastConnectedAt: new Date().toISOString(),
    lastError: null,
  }));
});

realtimeClient.on("close", () => {
  baseStore.setState((previous) => ({
    ...previous,
    status: "disconnected",
  }));
});

realtimeClient.on("error", (payload) => {
  baseStore.setState((previous) => ({
    ...previous,
    status: "error",
    lastError: payload.message,
  }));
});

realtimeClient.on("reconnectScheduled", (payload) => {
  baseStore.setState((previous) => ({
    ...previous,
    status: "reconnecting",
    retryCount: payload.attempt,
  }));
});

realtimeClient.on("message", (payload) => {
  baseStore.setState((previous) => ({
    ...previous,
    lastEventType: payload.type,
  }));

  if (payload.type === "notification") {
    notificationsStore.actions.pushNotification({
      id: payload.id,
      title: payload.title,
      body: payload.body,
      createdAt: payload.created_at,
      tenantId: payload.tenant_id ?? null,
      patientId: payload.patient_id ?? null,
      eventType: payload.event_type ?? null,
      entityType: payload.entity_type ?? null,
      entityId: payload.entity_id ?? null,
      category: payload.category ?? null,
      metadata: payload.metadata ?? null,
    });
  }

  if (payload.type === "error") {
    baseStore.setState((previous) => ({
      ...previous,
      status: "error",
      lastError: payload.message,
    }));
  }
});

function mapParamsToState(params: RealtimeConnectParams): Pick<RealtimeState, "channel"> {
  return {
    channel: params.channel,
  };
}

export const realtimeStore = {
  ...baseStore,
  actions: {
    connect(params: RealtimeConnectParams): void {
      baseStore.setState((previous) => ({
        ...previous,
        ...mapParamsToState(params),
        status: "connecting",
        lastError: null,
      }));

      realtimeClient.connect(params);
    },

    disconnect(): void {
      realtimeClient.disconnect();
      baseStore.setState((previous) => ({
        ...previous,
        status: "idle",
        retryCount: 0,
        channel: null,
      }));
    },

    clear(): void {
      realtimeClient.disconnect();
      baseStore.setState(initialRealtimeState);
    },

    sendPing(): void {
      realtimeClient.send({
        type: "ping",
      });
    },
  },
};
