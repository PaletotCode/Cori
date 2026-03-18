export type PatientContactChannel = "whatsapp" | "email" | "phone";
export type PatientContactPeriod = "morning" | "afternoon" | "night" | "flexible";
export type PatientProfileSource = "manual" | "intake";
export type PatientSortBy = "full_name" | "created_at" | "updated_at";
export type SortOrder = "asc" | "desc";
export type PatientChangeType = "created" | "updated" | "overwritten" | "archived";

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
  preferredContactPeriod: PatientContactPeriod | null;
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
  preferredContactPeriod?: PatientContactPeriod;
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
}

export interface PatientChange {
  id: string;
  changeType: PatientChangeType;
  changedFields: string[];
  previousData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  changedByUserId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface PatientTimelineEvent {
  id: string;
  eventType: string;
  actorType: string;
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PatientArchiveResult {
  patientId: string;
  archivedAt: string;
}
