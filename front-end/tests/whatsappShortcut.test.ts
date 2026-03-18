import { buildWhatsappShortcut } from "../src/features/patients/domain/whatsappShortcut";

describe("whatsapp shortcut", () => {
  it("builds direct whatsapp url when number is valid", () => {
    const shortcut = buildWhatsappShortcut({
      phone: "+55 (65) 99999-0001",
      message: "Ola, vamos confirmar sua sessao?",
    });

    expect(shortcut.isFallback).toBe(false);
    expect(shortcut.normalizedPhone).toBe("5565999990001");
    expect(shortcut.url).toBe(
      "https://wa.me/5565999990001?text=Ola%2C%20vamos%20confirmar%20sua%20sessao%3F",
    );
  });

  it("falls back when number is invalid", () => {
    const shortcut = buildWhatsappShortcut({
      phone: "3211-1000",
      message: "Mensagem principal",
      fallbackMessage: "Mensagem fallback",
    });

    expect(shortcut.isFallback).toBe(true);
    expect(shortcut.reason).toBe("Numero invalido ou ausente para WhatsApp direto.");
    expect(shortcut.url).toBe("https://wa.me/?text=Mensagem%20fallback");
  });
});
