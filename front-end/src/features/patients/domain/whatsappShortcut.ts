export interface WhatsappShortcutInput {
  phone: string | null | undefined;
  message: string;
  fallbackMessage?: string;
}

export interface WhatsappShortcutResult {
  url: string;
  isFallback: boolean;
  reason: string | null;
  normalizedPhone: string | null;
}

const WHATSAPP_BASE_URL = "https://wa.me";

function normalizePhoneDigits(phone: string | null | undefined): string {
  if (phone === null || phone === undefined) {
    return "";
  }
  return phone.replace(/\D/g, "");
}

function isValidWhatsappDigits(digits: string): boolean {
  return digits.length >= 10 && digits.length <= 15;
}

function encodeMessage(message: string): string {
  return encodeURIComponent(message.trim());
}

export function buildWhatsappShortcut(input: WhatsappShortcutInput): WhatsappShortcutResult {
  const digits = normalizePhoneDigits(input.phone);
  const baseMessage = input.message.trim();
  const fallbackMessage = input.fallbackMessage?.trim();
  const resolvedMessage = baseMessage.length > 0 ? baseMessage : "Ola! Vamos alinhar seu atendimento?";

  if (isValidWhatsappDigits(digits)) {
    return {
      url: `${WHATSAPP_BASE_URL}/${digits}?text=${encodeMessage(resolvedMessage)}`,
      isFallback: false,
      reason: null,
      normalizedPhone: digits,
    };
  }

  const fallbackResolved =
    fallbackMessage && fallbackMessage.length > 0 ? fallbackMessage : resolvedMessage;
  return {
    url: `${WHATSAPP_BASE_URL}/?text=${encodeMessage(fallbackResolved)}`,
    isFallback: true,
    reason: "Numero invalido ou ausente para WhatsApp direto.",
    normalizedPhone: null,
  };
}
