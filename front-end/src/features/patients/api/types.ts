export type PatientContactChannel = "whatsapp" | "email" | "phone";
export type PatientProfileSource = "manual" | "intake";
export type PatientSortBy = "full_name" | "created_at" | "updated_at";
export type SortOrder = "asc" | "desc";
export type PatientChangeType = "created" | "updated" | "overwritten" | "archived";
export type PatientOverviewBaselineItem = "yesterday" | "weekAgo" | "monthAgo";
export type PatientOverviewKpiCardKey =
  | "completed_sessions"
  | "upcoming_sessions"
  | "assigned_activities"
  | "patient_journey_days";
export type PatientOverviewTrendDirection = "up" | "down" | "flat" | "unknown";

export interface PatientsApiErrorPayload {
  detail?: string;
}

export interface PatientListItem {
  id: string;
  fullName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  preferredContactChannel: PatientContactChannel;
  profileSource: PatientProfileSource;
  whatsappNumberValid: boolean;
  updatedAt: string;
}

export interface PatientDetail {
  id: string;
  tenantId: string;
  fullName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  pronouns: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  preferredContactChannel: PatientContactChannel;
  communicationNotes: string | null;
  profileSource: PatientProfileSource;
  whatsappNumberValid: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PatientCreatePayload {
  fullName: string;
  preferredName?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  pronouns?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  preferredContactChannel?: PatientContactChannel;
  communicationNotes?: string;
}

export interface PatientUpdatePayload extends PatientCreatePayload {
  overwriteInitialRegistration?: boolean;
  overwriteReason?: string;
}

export interface ListPatientsOptions {
  search?: string;
  preferredContactChannel?: PatientContactChannel;
  hasWhatsapp?: boolean;
  sortBy?: PatientSortBy;
  sortOrder?: SortOrder;
  limit?: number;
  offset?: number;
}

export interface PatientChange {
  id: string;
  changeType: PatientChangeType;
  changedFields: string[];
  previousData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  changedByUserId: string | null;
  reason: string | null;
  naturalSummary?: string;
  createdAt: string;
}

export interface PatientTimelineEvent {
  id: string;
  eventType: string;
  categoryLabel?: string;
  actorType: string;
  actorLabel?: string;
  actorId: string | null;
  payload: Record<string, unknown>;
  naturalTitle?: string;
  naturalEventLabel?: string;
  naturalDetail?: string;
  createdAt: string;
}

export interface PatientArchiveResult {
  patientId: string;
  archivedAt: string;
}

export interface PatientOverviewKpiComparison {
  item: PatientOverviewBaselineItem;
  baselineValue: number | null;
  deltaValue: number | null;
  deltaPercent: number | null;
  trend: PatientOverviewTrendDirection;
  comparable: boolean;
  missingBaseline: boolean;
  windowStartAt: string;
  windowEndAt: string;
  metadata: Record<string, unknown>;
}

export interface PatientOverviewKpiCard {
  key: PatientOverviewKpiCardKey;
  unit: "count";
  currentValue: number | null;
  windowStartAt: string;
  windowEndAt: string;
  comparisons: PatientOverviewKpiComparison[];
  metadata: Record<string, unknown>;
}

export interface PatientOverviewKpis {
  timezone: string;
  generatedAt: string;
  calculationVersion: "patient_overview_kpi_v1";
  cards: PatientOverviewKpiCard[];
}
