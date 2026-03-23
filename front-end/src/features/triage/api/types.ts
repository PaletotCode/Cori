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
  accessCodeAlias?: string;
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
  accessCode: string;
  accessCodeExpiresAt: string;
}

export interface IntakeQueueItem {
  intakeId: string;
  mode: IntakeMode;
  status: IntakeStatus;
  inviteExpiresAt: string;
  accessCodeExpiresAt: string | null;
  openedAt: string | null;
  submittedAt: string | null;
  patientFullName: string | null;
  patientPreferredName: string | null;
  patientEmail: string | null;
  patientPhone: string | null;
  patientBirthDate: string | null;
  patientPronouns: string | null;
  patientEmergencyContactName: string | null;
  patientEmergencyContactPhone: string | null;
  patientProfilePhotoUrl: string | null;
  patientProfileBannerUrl: string | null;
  complementRequestNote: string | null;
  activatedPatientId: string | null;
  hasTriageAnswers: boolean;
}

export interface IntakeDetail {
  intakeId: string;
  mode: IntakeMode;
  status: IntakeStatus;
  inviteExpiresAt: string;
  accessCodeExpiresAt: string | null;
  openedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  activatedAt: string | null;
  patientFullName: string | null;
  patientPreferredName: string | null;
  patientEmail: string | null;
  patientPhone: string | null;
  patientBirthDate: string | null;
  patientPronouns: string | null;
  patientEmergencyContactName: string | null;
  patientEmergencyContactPhone: string | null;
  patientCommunicationNotes: string | null;
  patientProfilePhotoUrl: string | null;
  patientProfileBannerUrl: string | null;
  customQuestions: IntakeCustomQuestion[];
  triageAnswers: Record<string, string> | null;
  reviewNote: string | null;
  complementRequestNote: string | null;
  activatedPatientId: string | null;
}

export interface IntakePatientSubmitPayload {
  patientFullName: string;
  patientPreferredName?: string;
  patientEmail?: string;
  patientPhone?: string;
  patientBirthDate?: string;
  patientPronouns?: string;
  patientEmergencyContactName?: string;
  patientEmergencyContactPhone?: string;
  patientCommunicationNotes?: string;
  patientProfilePhotoUrl?: string;
  patientProfileBannerUrl?: string;
  consentTermsAccepted: true;
  consentPrivacyAccepted: true;
}

export interface IntakePatientSubmitResult {
  intakeId: string;
  status: IntakeStatus;
  submittedAt: string | null;
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

export interface IntakeRotateCodePayload {
  alias?: string;
}

export interface IntakeRotateCodeResult {
  intakeId: string;
  accessCode: string;
  accessCodeExpiresAt: string;
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
  detail?: unknown;
}
