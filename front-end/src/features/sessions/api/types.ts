export type AgendaView = "day" | "week" | "month";
export type SessionStatus = "scheduled" | "confirmed" | "rescheduled" | "canceled" | "completed";
export type SessionLocationMode = "online" | "presential" | "hybrid";
export type SessionAction = "confirm" | "reschedule" | "cancel" | "complete";

export interface SessionsApiErrorPayload {
  detail?: string;
}

export interface SessionAgendaItem {
  id: string;
  patientId: string;
  patientName: string;
  psychologistId: string;
  status: SessionStatus;
  locationMode: SessionLocationMode;
  scheduledStartAt: string;
  scheduledEndAt: string;
  confirmationTokenExpiresAt: string;
}

export interface SessionDetail extends SessionAgendaItem {
  tenantId: string;
  meetingLink: string | null;
  notes: string | null;
  cancellationReason: string | null;
  canceledAt: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  rescheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionCreatePayload {
  patientId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  locationMode?: SessionLocationMode;
  meetingLink?: string;
  notes?: string;
}

export interface SessionCreateResult extends SessionDetail {
  confirmationToken: string;
  confirmationLink: string;
}

export interface SessionActionPayload {
  action: SessionAction;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  reason?: string;
}

export interface SessionTimelineEvent {
  id: string;
  eventType: string;
  actorType: string;
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PublicSessionList {
  patientId: string;
  patientName: string;
  sessions: SessionAgendaItem[];
}

export interface PublicSessionConfirmResult {
  sessionId: string;
  status: SessionStatus;
  confirmedAt: string | null;
}

export interface SessionReminderRunResult {
  processed: number;
  sent: number;
  failed: number;
}
