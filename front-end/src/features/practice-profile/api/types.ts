export type ServiceModality = "online" | "presential" | "hybrid";
export type TriageMode = "standard" | "custom";

export interface PracticeProfileUpsertPayload {
  practice_name: string;
  clinical_approach: string;
  service_modality: ServiceModality;
  in_person_address: string | null;
  session_price_cents: number;
  currency: "BRL";
  late_cancellation_window_hours: number;
  late_cancellation_fee_percent: number;
  no_show_fee_percent: number;
  notification_email_enabled: boolean;
  notification_whatsapp_enabled: boolean;
  notification_push_enabled: boolean;
  session_reminder_hours_before: number[];
  default_triage_mode: TriageMode;
  default_triage_message: string | null;
}

export interface PracticeProfileResponse extends PracticeProfileUpsertPayload {
  id: string;
  tenant_id: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface PracticeProfile {
  id: string;
  tenantId: string;
  practiceName: string;
  clinicalApproach: string;
  serviceModality: ServiceModality;
  inPersonAddress: string | null;
  sessionPriceCents: number;
  currency: "BRL";
  lateCancellationWindowHours: number;
  lateCancellationFeePercent: number;
  noShowFeePercent: number;
  notificationEmailEnabled: boolean;
  notificationWhatsappEnabled: boolean;
  notificationPushEnabled: boolean;
  sessionReminderHoursBefore: number[];
  defaultTriageMode: TriageMode;
  defaultTriageMessage: string | null;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeProfileApiErrorPayload {
  detail?: string;
}
