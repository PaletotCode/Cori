export type ActivityType = "simple_task" | "guided_meditation" | "habit" | "document_reading";
export type ActivityStatus =
  | "scheduled"
  | "assigned"
  | "opened"
  | "in_progress"
  | "paused"
  | "completed"
  | "canceled"
  | "overdue";
export type ActivityRecurrenceRule = "none" | "daily" | "weekly";
export type PsychologistActivityAction = "resend" | "cancel" | "reopen";
export type PatientActivityAction = "open" | "start" | "pause" | "complete";

export interface ActivitiesApiErrorPayload {
  detail?: string;
}

export interface ActivityItem {
  id: string;
  patientId: string;
  patientName: string;
  psychologistId: string;
  sourceTemplateId?: string | null;
  activityType: ActivityType;
  status: ActivityStatus;
  title: string;
  dueAt: string;
  scheduledSendAt?: string | null;
  assignedAt: string;
  overdueAt: string | null;
  recurrenceRule: ActivityRecurrenceRule;
  recurrenceInterval: number;
  recurrenceEndAt: string | null;
  executionElapsedSeconds: number;
}

export interface ActivityDetail extends ActivityItem {
  tenantId: string;
  description: string | null;
  instructions: string | null;
  documentUrl: string | null;
  configuration: Record<string, unknown>;
  openedAt: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  feedbackNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityCreatePayload {
  patientId: string;
  activityType: ActivityType;
  title: string;
  description?: string;
  instructions?: string;
  documentUrl?: string;
  configuration?: Record<string, unknown>;
  dueAt: string;
  recurrenceRule?: ActivityRecurrenceRule;
  recurrenceInterval?: number;
  recurrenceEndAt?: string;
}

export interface ActivityUpdatePayload {
  activityType?: ActivityType;
  title?: string;
  description?: string;
  instructions?: string;
  documentUrl?: string;
  configuration?: Record<string, unknown>;
  dueAt?: string;
  recurrenceRule?: ActivityRecurrenceRule;
  recurrenceInterval?: number;
  recurrenceEndAt?: string;
}

export interface ActivityCreateResult extends ActivityDetail {
  patientAccessToken: string;
  patientAccessLink: string;
}

export interface ActivityPsychologistActionPayload {
  action: PsychologistActivityAction;
  reason?: string;
}

export interface ActivityPatientActionPayload {
  action: PatientActivityAction;
  feedbackNote?: string;
}

export interface ActivityTimelineEvent {
  id: string;
  activityId: string | null;
  patientId: string | null;
  eventType: string;
  actorType: string;
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PublicActivityList {
  patientId: string;
  patientName: string;
  activities: ActivityItem[];
}

export interface PublicActivityActionResult {
  activity: ActivityDetail;
}

export interface ActivitiesOverdueRunResult {
  processed: number;
  markedOverdue: number;
}

export type TemplateSendMode = "immediate" | "scheduled";

export interface ActivityTemplateListItem {
  id: string;
  tenantId: string;
  psychologistId: string;
  title: string;
  description: string | null;
  instructions: string | null;
  documentUrl: string | null;
  configuration: Record<string, unknown>;
  activityType: ActivityType;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ActivityTemplateCreatePayload {
  title: string;
  description?: string;
  instructions?: string;
  documentUrl?: string;
  configuration?: Record<string, unknown>;
  activityType: ActivityType;
}

export interface ActivityTemplateAssignOverridesPayload {
  title?: string;
  description?: string;
  instructions?: string;
  documentUrl?: string;
  configuration?: Record<string, unknown>;
  activityType?: ActivityType;
  recurrenceRule?: ActivityRecurrenceRule;
  recurrenceInterval?: number;
  recurrenceEndAt?: string;
}

export interface ActivityTemplateAssignPayload {
  patientId: string;
  sendMode: TemplateSendMode;
  scheduledSendAt?: string;
  dueAt: string;
  overrides?: ActivityTemplateAssignOverridesPayload;
}

export interface ActivityTemplateAssignResult {
  idempotencyReplayed: boolean;
  activity: ActivityDetail;
}
