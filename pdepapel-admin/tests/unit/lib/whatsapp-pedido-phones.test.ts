import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));
vi.mock("@/lib/whatsapp/draft-orders", () => ({ createWhatsAppDraftOrder: vi.fn() }));
vi.mock("@/lib/guide-with-rate", () => ({ createGuideWithRate: vi.fn() }));
vi.mock("@/lib/shipping-helpers", () => ({ requoteCartShipping: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: vi.fn() }));

import { parseAdminCommand } from "@/lib/whatsapp/admin-commands";
import { runDraftCommand } from "@/lib/whatsapp/admin-command-actions";
import { createWhatsAppDraftOrder } from "@/lib/whatsapp/draft-orders";

/**
 * «/pedido»: el celular llega como Paula lo copia del chat. Todas las formas
 * de un mismo celular colombiano quedan en los mismos 10 dígitos; un número
 * de 7 cifras (fijo viejo, o le faltan dígitos) no crea nada y contesta el
 * texto de siempre.
 */
const SAME = [
  "3001234567",
  "300 123 4567",
  "300-123-4567",
  "+57 300 123 4567",
  "573001234567",
  "(300) 1234567",
];

describe("/pedido: formas del celular", () => {
  it.each(SAME)("«%s» queda en 3001234567, con el valor y la nota intactos", (phone) => {
    expect(parseAdminCommand(`/pedido ${phone} 30 mil agenda stitch`)?.draft).toEqual({
      phoneTail: "3001234567",
      username: null,
      amount: 30000,
      note: "agenda stitch",
      error: null,
    });
  });

  it.each(["3012345", "301 2345", "301-2345"])("«%s» (7 cifras) no pasa y contesta el texto de celular inválido", async (phone) => {
    const draft = parseAdminCommand(`/pedido ${phone} 30 mil`)?.draft;
    expect(draft).toMatchObject({ phoneTail: null, error: "bad_phone" });
    const answer = await runDraftCommand("store-1", draft);
    expect(answer).toMatchObject({ status: "DONE", outcome: "bad_phone" });
    expect(answer.reply).toBe("Ese celular no es colombiano de 10 dígitos (3xx). Ej.: /pedido 300 123 4567 30 mil");
    expect(createWhatsAppDraftOrder).not.toHaveBeenCalled();
  });
});
