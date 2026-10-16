import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/whatsapp/bot", () => ({ runWhatsAppBot: vi.fn(), NO_MATCH_ACKNOWLEDGEMENT: "x" }));
vi.mock("@/lib/whatsapp/shadow/run", () => ({ runWhatsAppBotShadow: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { extractWhatsAppEvents } from "@/lib/whatsapp/conversation-sync";
import { inboundKindOf, isCustomerSignal, realInboundWhere } from "@/lib/whatsapp/message-kinds";

const payload = (message: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "PHONE-1" }, messages: [message] } }] }],
});

describe("tipo de mensaje entrante", () => {
  it("reacción y borrado son señales; texto, foto, audio, toque y edición son mensajes", () => {
    expect(inboundKindOf("reaction")).toBe("signal");
    expect(inboundKindOf("revoke")).toBe("signal");
    for (const type of [null, "image", "audio", "interactive", "edit", "sticker"]) expect(inboundKindOf(type)).toBe("message");
    expect(isCustomerSignal(undefined)).toBe(false);
  });

  it("se clasifica en el webhook, al extraer el mensaje", () => {
    const from = "573001234567";
    const [reaction] = extractWhatsAppEvents(payload({ from, id: "wamid.r", timestamp: "1789300000", type: "reaction", reaction: { message_id: "wamid.x", emoji: "👍" } }) as never).messages;
    const [revoke] = extractWhatsAppEvents(payload({ from, id: "wamid.d", timestamp: "1789300000", type: "revoke" }) as never).messages;
    const [text] = extractWhatsAppEvents(payload({ from, id: "wamid.t", timestamp: "1789300000", type: "text", text: { body: "hola" } }) as never).messages;
    expect(reaction.kind).toBe("signal");
    expect(revoke.kind).toBe("signal");
    expect(text.kind).toBe("message");
  });

  it("el filtro de Prisma deja pasar los mensajes sin tipo (NULL)", () => {
    expect(realInboundWhere).toEqual({ OR: [{ mediaType: null }, { mediaType: { notIn: ["reaction", "revoke"] } }] });
  });
});
