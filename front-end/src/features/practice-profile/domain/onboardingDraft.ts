import type { PracticeProfile, PracticeProfileUpsertPayload, ServiceModality, TriageMode } from "../api/types";

export type PracticeProfileStepId =
  | "identity"
  | "modality"
  | "financial"
  | "absence_policy"
  | "notifications"
  | "triage";

export interface PracticeProfileDraft {
  practiceName: string;
  clinicalApproach: string;
  serviceModality: ServiceModality;
  inPersonAddress: string;
  sessionPriceReais: string;
  lateCancellationWindowHours: string;
  lateCancellationFeePercent: string;
  noShowFeePercent: string;
  notificationEmailEnabled: boolean;
  notificationWhatsappEnabled: boolean;
  notificationPushEnabled: boolean;
  sessionReminderHoursBefore: string;
  defaultTriageMode: TriageMode;
  defaultTriageMessage: string;
}

export interface PracticeProfileDraftValidationResult {
  isValid: boolean;
  fieldErrors: Partial<Record<keyof PracticeProfileDraft, string>>;
}

export const onboardingSteps: Array<{
  id: PracticeProfileStepId;
  title: string;
  subtitle: string;
}> = [
  {
    id: "identity",
    title: "Identidade clinica",
    subtitle: "Dados base que representam sua clinica para todo o app.",
  },
  {
    id: "modality",
    title: "Modalidade",
    subtitle: "Define atendimento online/presencial/hibrido.",
  },
  {
    id: "financial",
    title: "Regra financeira base",
    subtitle: "Valor de sessao e moeda padrao da clinica.",
  },
  {
    id: "absence_policy",
    title: "Politica de faltas",
    subtitle: "Janela de cancelamento e taxas por ausencia.",
  },
  {
    id: "notifications",
    title: "Preferencias de notificacao",
    subtitle: "Canais e antecedencia de lembretes.",
  },
  {
    id: "triage",
    title: "Triagem padrao",
    subtitle: "Mensagem padrao para entrada de novos pacientes.",
  },
];

export function createInitialPracticeProfileDraft(): PracticeProfileDraft {
  return {
    practiceName: "",
    clinicalApproach: "",
    serviceModality: "online",
    inPersonAddress: "",
    sessionPriceReais: "250",
    lateCancellationWindowHours: "24",
    lateCancellationFeePercent: "40",
    noShowFeePercent: "80",
    notificationEmailEnabled: true,
    notificationWhatsappEnabled: true,
    notificationPushEnabled: true,
    sessionReminderHoursBefore: "48,24,2",
    defaultTriageMode: "standard",
    defaultTriageMessage: "",
  };
}

export function draftFromPracticeProfile(profile: PracticeProfile): PracticeProfileDraft {
  return {
    practiceName: profile.practiceName,
    clinicalApproach: profile.clinicalApproach,
    serviceModality: profile.serviceModality,
    inPersonAddress: profile.inPersonAddress ?? "",
    sessionPriceReais: (profile.sessionPriceCents / 100).toFixed(2).replace(/\.00$/, ""),
    lateCancellationWindowHours: String(profile.lateCancellationWindowHours),
    lateCancellationFeePercent: String(profile.lateCancellationFeePercent),
    noShowFeePercent: String(profile.noShowFeePercent),
    notificationEmailEnabled: profile.notificationEmailEnabled,
    notificationWhatsappEnabled: profile.notificationWhatsappEnabled,
    notificationPushEnabled: profile.notificationPushEnabled,
    sessionReminderHoursBefore: profile.sessionReminderHoursBefore.join(","),
    defaultTriageMode: profile.defaultTriageMode,
    defaultTriageMessage: profile.defaultTriageMessage ?? "",
  };
}

function parseInteger(raw: string): number | null {
  const normalized = raw.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseSessionPriceToCents(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

export function parseReminderHours(raw: string): number[] | null {
  const chunks = raw
    .split(",")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

  if (chunks.length === 0) {
    return null;
  }

  const parsed = chunks.map((chunk) => Number.parseInt(chunk, 10));
  if (parsed.some((value) => Number.isNaN(value))) {
    return null;
  }

  return parsed;
}

function validateIdentityStep(
  draft: PracticeProfileDraft,
): Partial<Record<keyof PracticeProfileDraft, string>> {
  const fieldErrors: Partial<Record<keyof PracticeProfileDraft, string>> = {};

  if (draft.practiceName.trim().length < 3) {
    fieldErrors.practiceName = "Informe nome da clinica com ao menos 3 caracteres.";
  }
  if (draft.clinicalApproach.trim().length < 2) {
    fieldErrors.clinicalApproach = "Informe abordagem clinica valida.";
  }

  return fieldErrors;
}

function validateModalityStep(
  draft: PracticeProfileDraft,
): Partial<Record<keyof PracticeProfileDraft, string>> {
  const fieldErrors: Partial<Record<keyof PracticeProfileDraft, string>> = {};

  if ((draft.serviceModality === "presential" || draft.serviceModality === "hybrid") && draft.inPersonAddress.trim().length < 5) {
    fieldErrors.inPersonAddress = "Endereco presencial e obrigatorio para modalidade presencial/hibrida.";
  }

  return fieldErrors;
}

function validateFinancialStep(
  draft: PracticeProfileDraft,
): Partial<Record<keyof PracticeProfileDraft, string>> {
  const fieldErrors: Partial<Record<keyof PracticeProfileDraft, string>> = {};
  const sessionPriceCents = parseSessionPriceToCents(draft.sessionPriceReais);

  if (sessionPriceCents === null || sessionPriceCents > 1_000_000) {
    fieldErrors.sessionPriceReais = "Valor da sessao invalido (maximo: 10000.00).";
  }

  return fieldErrors;
}

function validateAbsencePolicyStep(
  draft: PracticeProfileDraft,
): Partial<Record<keyof PracticeProfileDraft, string>> {
  const fieldErrors: Partial<Record<keyof PracticeProfileDraft, string>> = {};

  const windowHours = parseInteger(draft.lateCancellationWindowHours);
  if (windowHours === null || windowHours < 1 || windowHours > 168) {
    fieldErrors.lateCancellationWindowHours = "Janela deve ficar entre 1 e 168 horas.";
  }

  const lateFee = parseInteger(draft.lateCancellationFeePercent);
  if (lateFee === null || lateFee < 0 || lateFee > 100) {
    fieldErrors.lateCancellationFeePercent = "Taxa de cancelamento deve ficar entre 0 e 100%.";
  }

  const noShowFee = parseInteger(draft.noShowFeePercent);
  if (noShowFee === null || noShowFee < 0 || noShowFee > 100) {
    fieldErrors.noShowFeePercent = "Taxa de falta deve ficar entre 0 e 100%.";
  }

  return fieldErrors;
}

function validateNotificationsStep(
  draft: PracticeProfileDraft,
): Partial<Record<keyof PracticeProfileDraft, string>> {
  const fieldErrors: Partial<Record<keyof PracticeProfileDraft, string>> = {};

  if (
    !draft.notificationEmailEnabled &&
    !draft.notificationWhatsappEnabled &&
    !draft.notificationPushEnabled
  ) {
    fieldErrors.notificationEmailEnabled = "Ative ao menos um canal de notificacao.";
  }

  const reminders = parseReminderHours(draft.sessionReminderHoursBefore);
  if (reminders === null) {
    fieldErrors.sessionReminderHoursBefore = "Informe ao menos um horario separado por virgula.";
    return fieldErrors;
  }
  if (new Set(reminders).size !== reminders.length) {
    fieldErrors.sessionReminderHoursBefore = "Nao use horarios de lembrete duplicados.";
    return fieldErrors;
  }
  if (reminders.some((hour) => hour < 1 || hour > 168)) {
    fieldErrors.sessionReminderHoursBefore = "Lembretes devem ficar entre 1 e 168 horas.";
  }

  return fieldErrors;
}

function validateTriageStep(
  draft: PracticeProfileDraft,
): Partial<Record<keyof PracticeProfileDraft, string>> {
  const fieldErrors: Partial<Record<keyof PracticeProfileDraft, string>> = {};

  if (draft.defaultTriageMode === "custom" && draft.defaultTriageMessage.trim().length < 10) {
    fieldErrors.defaultTriageMessage = "Mensagem custom deve ter ao menos 10 caracteres.";
  }

  return fieldErrors;
}

function mergeFieldErrors(
  ...errors: Array<Partial<Record<keyof PracticeProfileDraft, string>>>
): Partial<Record<keyof PracticeProfileDraft, string>> {
  return errors.reduce<Partial<Record<keyof PracticeProfileDraft, string>>>(
    (acc, current) => ({ ...acc, ...current }),
    {},
  );
}

export function validateDraftForStep(
  draft: PracticeProfileDraft,
  stepId: PracticeProfileStepId,
): PracticeProfileDraftValidationResult {
  const fieldErrors =
    stepId === "identity"
      ? validateIdentityStep(draft)
      : stepId === "modality"
        ? validateModalityStep(draft)
        : stepId === "financial"
          ? validateFinancialStep(draft)
          : stepId === "absence_policy"
            ? validateAbsencePolicyStep(draft)
            : stepId === "notifications"
              ? validateNotificationsStep(draft)
              : validateTriageStep(draft);

  return {
    isValid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
}

export function validateFullDraft(draft: PracticeProfileDraft): PracticeProfileDraftValidationResult {
  const fieldErrors = mergeFieldErrors(
    validateIdentityStep(draft),
    validateModalityStep(draft),
    validateFinancialStep(draft),
    validateAbsencePolicyStep(draft),
    validateNotificationsStep(draft),
    validateTriageStep(draft),
  );

  return {
    isValid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
}

export function getFirstInvalidStepIndex(draft: PracticeProfileDraft): number | null {
  for (let index = 0; index < onboardingSteps.length; index += 1) {
    const stepValidation = validateDraftForStep(draft, onboardingSteps[index].id);
    if (!stepValidation.isValid) {
      return index;
    }
  }
  return null;
}

export function toPracticeProfileUpsertPayload(
  draft: PracticeProfileDraft,
): PracticeProfileUpsertPayload | null {
  const sessionPriceCents = parseSessionPriceToCents(draft.sessionPriceReais);
  const lateWindow = parseInteger(draft.lateCancellationWindowHours);
  const lateFee = parseInteger(draft.lateCancellationFeePercent);
  const noShowFee = parseInteger(draft.noShowFeePercent);
  const reminders = parseReminderHours(draft.sessionReminderHoursBefore);
  if (
    sessionPriceCents === null ||
    lateWindow === null ||
    lateFee === null ||
    noShowFee === null ||
    reminders === null
  ) {
    return null;
  }

  return {
    practice_name: draft.practiceName.trim(),
    clinical_approach: draft.clinicalApproach.trim(),
    service_modality: draft.serviceModality,
    in_person_address:
      draft.serviceModality === "online" ? null : (draft.inPersonAddress.trim() || null),
    session_price_cents: sessionPriceCents,
    currency: "BRL",
    late_cancellation_window_hours: lateWindow,
    late_cancellation_fee_percent: lateFee,
    no_show_fee_percent: noShowFee,
    notification_email_enabled: draft.notificationEmailEnabled,
    notification_whatsapp_enabled: draft.notificationWhatsappEnabled,
    notification_push_enabled: draft.notificationPushEnabled,
    session_reminder_hours_before: [...reminders].sort((a, b) => b - a),
    default_triage_mode: draft.defaultTriageMode,
    default_triage_message:
      draft.defaultTriageMode === "custom" ? draft.defaultTriageMessage.trim() : null,
  };
}
