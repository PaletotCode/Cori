import type { IntakeDetail, IntakeQueueItem } from "../../../triage/api/types";

export function formatTriageStatusLabel(status: IntakeQueueItem["status"]): string {
  if (status === "pending_submission") {
    return "Convite enviado";
  }
  if (status === "submitted") {
    return "Aguardando revisao";
  }
  if (status === "complement_requested") {
    return "Complemento solicitado";
  }
  if (status === "approved") {
    return "Aprovado";
  }
  if (status === "rejected") {
    return "Rejeitado";
  }
  return "Expirado";
}

export function canReviewTriageStatus(status: IntakeQueueItem["status"]): boolean {
  return status === "submitted" || status === "complement_requested";
}

export function resolvePatientInitials(fullName: string | null): string {
  const tokens = (fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return "P";
  }
  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }
  return `${tokens[0][0] ?? ""}${tokens[tokens.length - 1][0] ?? ""}`.toUpperCase();
}

export function resolveAccessCodeAlias(fullName: string | null): string {
  const token = (fullName ?? "")
    .trim()
    .split(/\s+/)
    .find((item) => item.length >= 2);
  if (!token) {
    return "CORI";
  }
  return token.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "CORI";
}

export function formatAccessCodeDisplay(accessCode: string): string {
  const parts = accessCode.trim().toUpperCase().split("-");
  if (parts.length === 3) {
    return `${parts[0]}  ${parts[1]}  ${parts[2]}`;
  }
  return accessCode.trim().toUpperCase();
}

export function formatTriageAnchorDate(item: IntakeQueueItem): string | null {
  if (item.submittedAt) {
    return `Enviado em ${new Date(item.submittedAt).toLocaleString("pt-BR")}`;
  }
  if (item.openedAt) {
    return `Convite aberto em ${new Date(item.openedAt).toLocaleString("pt-BR")}`;
  }
  if (item.accessCodeExpiresAt) {
    return `Codigo valido ate ${new Date(item.accessCodeExpiresAt).toLocaleString("pt-BR")}`;
  }
  return null;
}

export function summarizePendingPatient(item: IntakeQueueItem): string {
  const email = item.patientEmail?.trim() ?? "";
  const phone = item.patientPhone?.trim() ?? "";
  if (email.length > 0 && phone.length > 0) {
    return `${email} • ${phone}`;
  }
  if (email.length > 0) {
    return email;
  }
  if (phone.length > 0) {
    return phone;
  }
  return "Aguardando preenchimento de dados do paciente.";
}

export function mapQueueItemToIntakeDetail(item: IntakeQueueItem): IntakeDetail {
  return {
    intakeId: item.intakeId,
    mode: item.mode,
    status: item.status,
    inviteExpiresAt: item.inviteExpiresAt,
    accessCodeExpiresAt: item.accessCodeExpiresAt,
    openedAt: item.openedAt,
    submittedAt: item.submittedAt,
    reviewedAt: null,
    activatedAt: null,
    patientFullName: item.patientFullName,
    patientPreferredName: item.patientPreferredName,
    patientEmail: item.patientEmail,
    patientPhone: item.patientPhone,
    patientBirthDate: item.patientBirthDate,
    patientPronouns: item.patientPronouns,
    patientEmergencyContactName: item.patientEmergencyContactName,
    patientEmergencyContactPhone: item.patientEmergencyContactPhone,
    patientCommunicationNotes: null,
    patientProfilePhotoUrl: item.patientProfilePhotoUrl,
    patientProfileBannerUrl: item.patientProfileBannerUrl,
    customQuestions: [],
    triageAnswers: null,
    reviewNote: null,
    complementRequestNote: item.complementRequestNote,
    activatedPatientId: item.activatedPatientId,
  };
}
