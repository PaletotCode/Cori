export type NotificationCategory =
  | "sessions"
  | "activities"
  | "forms"
  | "documents"
  | "notifications"
  | "app_usage";

export type NotificationStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "action_taken"
  | "failed";

export type NotificationRuleCategory =
  | "all"
  | "sessions"
  | "activities"
  | "forms"
  | "documents"
  | "notifications"
  | "app_usage";

export interface NotificationPreferencesPayload {
  eventCategory?: NotificationRuleCategory;
  enabled: boolean;
  inboxEnabled: boolean;
  pushEnabled: boolean;
  realtimeEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  maxNotificationsPerHour: number;
}

export interface NotificationPreferences {
  id: string | null;
  tenantId: string;
  patientId: string | null;
  eventCategory: NotificationRuleCategory;
  enabled: boolean;
  inboxEnabled: boolean;
  pushEnabled: boolean;
  realtimeEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  maxNotificationsPerHour: number;
  source: "explicit" | "practice_profile_default" | "system_default";
  updatedAt: string | null;
}

export interface NotificationDelivery {
  id: string;
  tenantId: string;
  patientId: string;
  eventType: string;
  category: NotificationCategory;
  categoryLabel?: string;
  title: string;
  body: string;
  status: NotificationStatus;
  statusReason: string | null;
  naturalTitle?: string;
  naturalEventLabel?: string;
  naturalDetail?: string;
  channelInbox: boolean;
  channelPush: boolean;
  channelRealtime: boolean;
  metadata: Record<string, unknown>;
  queuedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  actionTakenAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UnifiedTimelineEvent {
  id: string;
  category: NotificationCategory;
  categoryLabel?: string;
  eventType: string;
  actorType: string;
  actorLabel?: string;
  actorId: string | null;
  sessionId: string | null;
  activityId: string | null;
  formId: string | null;
  notificationDeliveryId: string | null;
  payload: Record<string, unknown>;
  naturalTitle?: string;
  naturalEventLabel?: string;
  naturalDetail?: string;
  createdAt: string;
}

export interface PatientInboxResult {
  patientId: string;
  patientName: string;
  notifications: NotificationDelivery[];
}

export interface NotificationApiErrorPayload {
  detail?: string;
}
