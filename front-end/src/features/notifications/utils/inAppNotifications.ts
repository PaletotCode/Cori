import { notificationsStore } from "../store/notificationsStore";

export type InAppNotificationVariant = "info" | "success" | "error";

interface PublishInAppNotificationInput {
  title: string;
  body: string;
  variant?: InAppNotificationVariant;
  tenantId?: string | null;
  patientId?: string | null;
  eventType?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  category?: string | null;
  metadata?: Record<string, unknown> | null;
}

function createNotificationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `inapp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function naturalizeErrorMessage(
  message: string | null | undefined,
  fallback = "Nao foi possivel concluir agora. Tente novamente em alguns instantes.",
): string {
  const raw = (message ?? "").trim();
  if (raw.length === 0) {
    return fallback;
  }

  const normalized = raw.toLowerCase();

  if (normalized.includes("[object object]")) {
    return fallback;
  }
  if (normalized.includes("extra inputs are not permitted")) {
    return "Recebemos os dados em um formato inesperado. Atualize a tela e tente de novo.";
  }
  if (normalized.includes("extra_forbidden")) {
    return "Recebemos dados extras nesta etapa. Atualize a tela e tente novamente.";
  }
  if (normalized.includes("field required")) {
    return "Faltam informacoes obrigatorias. Revise os campos e tente novamente.";
  }
  if (normalized.includes("body.intake_access_code")) {
    return "O codigo de acesso informado nao foi aceito. Confira o codigo e tente novamente.";
  }
  if (normalized.includes("sessao expirada")) {
    return "Sua sessao expirou. Faca login novamente para continuar.";
  }
  if (normalized.includes("jwt pertence a outro tenant")) {
    return "Este acesso pertence a outra clinica. Confira o codigo e tente novamente.";
  }
  if (normalized.includes("state oauth")) {
    return "Nao foi possivel validar a autenticacao com seguranca. Reinicie o login.";
  }
  if (normalized.includes("invalid_grant")) {
    return "Nao foi possivel confirmar sua autenticacao com o Google. Tente entrar novamente.";
  }
  if (normalized.includes("network request failed")) {
    return "Sem conexao no momento. Verifique sua internet e tente de novo.";
  }

  return raw;
}

export function publishInAppNotification({
  title,
  body,
  variant = "info",
  tenantId = null,
  patientId = null,
  eventType = "app_notice",
  entityType = "ui",
  entityId = null,
  category = "notifications",
  metadata = null,
}: PublishInAppNotificationInput): string {
  const id = createNotificationId();
  notificationsStore.actions.pushNotification({
    id,
    title: title.trim(),
    body: body.trim(),
    createdAt: new Date().toISOString(),
    tenantId,
    patientId,
    eventType,
    entityType,
    entityId,
    category,
    metadata: {
      ...(metadata ?? {}),
      inAppVariant: variant,
      inAppSurface: "global",
    },
  });
  return id;
}
