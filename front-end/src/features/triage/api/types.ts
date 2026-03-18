export type IntakeMode = "simple_invite" | "custom_triage";
export type IntakeStatus =
  | "pending_submission"
  | "submitted"
  | "complement_requested"
  | "approved"
  | "rejected"
  | "expired";
export type IntakeReviewAction = "approve" | "reject" | "request_complement";

export interface IntakeCustomQuestion {
  questionId: string;
  prompt: string;
  required: boolean;
}

export interface IntakeInviteQuestionPayload {
  prompt: string;
  required: boolean;
}

export interface IntakeInviteCreatePayload {
  mode: IntakeMode;
  expiresInHours: number;
  inviteMessage?: string;
  customQuestions?: IntakeInviteQuestionPayload[];
}

export interface IntakeInviteCreateResult {
  intakeId: string;
  mode: IntakeMode;
  status: IntakeStatus;
  inviteToken: string;
  inviteLink: string;
  inviteExpiresAt: string;
}

export interface IntakePublicView {
  intakeId: string;
  mode: IntakeMode;
  status: IntakeStatus;
  inviteExpiresAt: string;
  practiceName: string | null;
  inviteMessage: string | null;
  requiresCustomTriage: boolean;
  customQuestions: IntakeCustomQuestion[];
  complementRequestNote: string | null;
}

export interface IntakePublicSubmitPayload {
  patientFullName: string;
  patientEmail?: string;
  patientPhone?: string;
  consentTermsAccepted: boolean;
  consentPrivacyAccepted: boolean;
  triageAnswers?: Record<string, string>;
}

export interface IntakePublicSubmitResult {
  intakeId: string;
  status: IntakeStatus;
  submittedAt: string | null;
}

export interface IntakeQueueItem {
  intakeId: string;
  mode: IntakeMode;
  status: IntakeStatus;
  inviteExpiresAt: string;
  openedAt: string | null;
  submittedAt: string | null;
  patientFullName: string | null;
  patientEmail: string | null;
  patientPhone: string | null;
  complementRequestNote: string | null;
  activatedPatientId: string | null;
  hasTriageAnswers: boolean;
}

export interface IntakeDetail {
  intakeId: string;
  mode: IntakeMode;
  status: IntakeStatus;
  inviteExpiresAt: string;
  openedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  activatedAt: string | null;
  patientFullName: string | null;
  patientEmail: string | null;
  patientPhone: string | null;
  customQuestions: IntakeCustomQuestion[];
  triageAnswers: Record<string, string> | null;
  reviewNote: string | null;
  complementRequestNote: string | null;
  activatedPatientId: string | null;
}

export interface IntakeReviewPayload {
  action: IntakeReviewAction;
  note?: string;
}

export interface IntakeReviewResult {
  intakeId: string;
  status: IntakeStatus;
  reviewedAt: string | null;
  activatedPatientId: string | null;
}

export interface TimelineEvent {
  id: string;
  intakeId: string | null;
  patientId: string | null;
  eventType: string;
  actorType: string;
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TriageApiErrorPayload {
  detail?: string;
}
