import { describe, expect, it, vi } from "vitest";

import { canRecordChatOptIn, canSendWhatsAppOrderUpdates, orderWhatsAppOptInData, WHATSAPP_OPT_IN_VERSION } from "@/lib/whatsapp-opt-in";

describe("consentimiento de avisos por WhatsApp", () => {
  const now = new Date("2026-10-26T20:00:00Z");

  it("la casilla marcada en el checkout guarda hora, versión y origen", () => {
    expect(orderWhatsAppOptInData({ isStoreOwner: false, whatsappOptIn: { version: WHATSAPP_OPT_IN_VERSION }, now })).toEqual({
      whatsappOptInAt: now,
      whatsappOptInVersion: WHATSAPP_OPT_IN_VERSION,
      whatsappOptInSource: "CHECKOUT",
    });
  });

  it("sin casilla, con una versión desconocida o creado por la dueña no guarda nada", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(orderWhatsAppOptInData({ isStoreOwner: false, whatsappOptIn: undefined })).toEqual({});
    expect(orderWhatsAppOptInData({ isStoreOwner: false, whatsappOptIn: false })).toEqual({});
    expect(orderWhatsAppOptInData({ isStoreOwner: false, whatsappOptIn: { version: "1999-01-01" } })).toEqual({});
    expect(orderWhatsAppOptInData({ isStoreOwner: false, whatsappOptIn: true })).toEqual({});
    expect(orderWhatsAppOptInData({ isStoreOwner: true, whatsappOptIn: { version: WHATSAPP_OPT_IN_VERSION } })).toEqual({});
    warn.mockRestore();
  });

  it("solo sale WhatsApp con el interruptor encendido, consentimiento y sin baja", () => {
    const on = { whatsappOrderUpdatesEnabled: true };
    expect(canSendWhatsAppOrderUpdates({ settings: on, order: { whatsappOptInAt: now, whatsappOptOutAt: null } })).toBe(true);
    expect(canSendWhatsAppOrderUpdates({ settings: { whatsappOrderUpdatesEnabled: false }, order: { whatsappOptInAt: now, whatsappOptOutAt: null } })).toBe(false);
    expect(canSendWhatsAppOrderUpdates({ settings: null, order: { whatsappOptInAt: now, whatsappOptOutAt: null } })).toBe(false);
    expect(canSendWhatsAppOrderUpdates({ settings: on, order: { whatsappOptInAt: null, whatsappOptOutAt: null } })).toBe(false);
    expect(canSendWhatsAppOrderUpdates({ settings: on, order: { whatsappOptInAt: now, whatsappOptOutAt: now } })).toBe(false);
  });

  it("el panel solo anota el consentimiento de pedidos nacidos en WhatsApp", () => {
    expect(canRecordChatOptIn({ source: "WHATSAPP", hasWhatsAppConversation: false })).toBe(true);
    expect(canRecordChatOptIn({ source: "PANEL", hasWhatsAppConversation: true })).toBe(true);
    expect(canRecordChatOptIn({ source: "STORE", hasWhatsAppConversation: false })).toBe(false);
    expect(canRecordChatOptIn({ source: null, hasWhatsAppConversation: false })).toBe(false);
  });
});
