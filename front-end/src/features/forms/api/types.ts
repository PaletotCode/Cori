export type FormStatus =
  | "draft"
  | "published"
  | "scheduled"
  | "assigned"
  | "opened"
  | "partial_saved"
  | "submitted"
  | "reviewed";

export type FormFieldType =
  | "short_text"
  | "long_text"
  | "multiple_choice"
  | "checkbox"
  | "scale"
  | "date_time";

export type PsychologistFormAction = "publish" | "send" | "schedule" | "review";
export type PatientFormAction = "open" | "partial_save" | "submit";

export interface FormsApiErrorPayload {
  detail?: string;
}

export interface FormQuestion {
  questionId: string;
  label: string;
  fieldType: FormFieldType;
  required: boolean;
  helpText: string | null;
  options: string[] | null;
  scaleMin: number | null;
  scaleMax: number | null;
}

export interface FormSection {
  sectionId: string;
  title: string;
  description: string | null;
  questions: FormQuestion[];
}

export interface ClinicalFormListItem {
  id: string;
  patientId: string;
  patientName: string;
  psychologistId: string;
  sourceTemplateId?: string | null;
  status: FormStatus;
  title: string;
  subtitle: string | null;
  publishedAt: string | null;
  scheduledSendAt: string | null;
  assignedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export interface ClinicalFormDetail extends ClinicalFormListItem {
  tenantId: string;
  header: string | null;
  sections: FormSection[];
  responseData: Record<string, unknown> | null;
  openedAt: string | null;
  partialSavedAt: string | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FormQuestionPayload {
  questionId?: string;
  label: string;
  fieldType: FormFieldType;
  required?: boolean;
  helpText?: string;
  options?: string[];
  scaleMin?: number;
  scaleMax?: number;
}

export interface FormSectionPayload {
  sectionId?: string;
  title: string;
  description?: string;
  questions: FormQuestionPayload[];
}

export interface ClinicalFormCreatePayload {
  patientId: string;
  title: string;
  subtitle?: string;
  header?: string;
  sections: FormSectionPayload[];
}

export interface ClinicalFormUpdatePayload {
  title?: string;
  subtitle?: string;
  header?: string;
  sections?: FormSectionPayload[];
}

export interface ClinicalFormCreateResult extends ClinicalFormDetail {
  patientAccessToken: string;
  patientAccessLink: string;
}

export interface ClinicalFormPsychologistActionPayload {
  action: PsychologistFormAction;
  scheduledSendAt?: string;
  reviewNote?: string;
}

export interface ClinicalFormPatientActionPayload {
  action: PatientFormAction;
  answers?: Record<string, unknown>;
}

export interface ClinicalFormTimelineEvent {
  id: string;
  formId: string | null;
  patientId: string | null;
  eventType: string;
  actorType: string;
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ClinicalFormPublicList {
  patientId: string;
  patientName: string;
  forms: ClinicalFormDetail[];
}

export interface ClinicalFormPublicActionResult {
  form: ClinicalFormDetail;
}

export interface FormsDispatchRunResult {
  processed: number;
  dispatched: number;
}

export type TemplateSendMode = "immediate" | "scheduled";

export interface FormTemplateListItem {
  id: string;
  tenantId: string;
  psychologistId: string;
  title: string;
  subtitle: string | null;
  header: string | null;
  sections: FormSection[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface FormTemplateCreatePayload {
  title: string;
  subtitle?: string;
  header?: string;
  sections: FormSectionPayload[];
}

export interface FormTemplateAssignOverridesPayload {
  title?: string;
  subtitle?: string;
  header?: string;
  sections?: FormSectionPayload[];
}

export interface FormTemplateAssignPayload {
  patientId: string;
  sendMode: TemplateSendMode;
  scheduledSendAt?: string;
  overrides?: FormTemplateAssignOverridesPayload;
}

export interface FormTemplateAssignResult {
  idempotencyReplayed: boolean;
  form: ClinicalFormDetail;
}
