import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { handoffExpired } from "@/lib/conversation-bot-pause";
import { splitLeadingGreeting } from "@/lib/whatsapp/bot-facts";
import { chooseFromBurst, type BurstContext } from "@/lib/whatsapp/burst";
import { isOptOutMessage, phoneTail } from "@/lib/whatsapp/opt-out";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-10-27T15:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("«BAJA» solo como mensaje entero", () => {
  it.each(["BAJA", "baja", "Baja.", "baja!!", " STOP ", "No más avisos", "no mas avisos 🙏", "quiero darme de baja"])("«%s» es una baja", (text) => {
    expect(isOptOutMessage(text)).toBe(true);
  });

  it.each(["¿tienen la carpeta baja?", "carpeta baja", "la baja de precio", "stop motion", "no más", "bajar", ""])("«%s» no lo es", (text) => {
    expect(isOptOutMessage(text)).toBe(false);
  });

  it("los diez últimos dígitos encuentran el pedido con o sin prefijo", () => {
    expect(phoneTail("+57 300 123 4567")).toBe("3001234567");
    expect(phoneTail("573001234567")).toBe("3001234567");
    expect(phoneTail("12345")).toBeNull();
  });
});

describe("un saludo delante de la pregunta", () => {
  it.each([
    ["Hola, ¿tienen marcadores baratos?", "Hola,", "¿tienen marcadores baratos?"],
    ["hola buenas tardes tienen cuadernos de stitch?", "hola buenas tardes", "tienen cuadernos de stitch?"],
    ["¡Buenos días! precio de los colores", "¡Buenos días!", "precio de los colores"],
  ])("«%s»", (body, greeting, rest) => {
    expect(splitLeadingGreeting(body)).toEqual({ greeting, rest });
  });

  it("sin saludo o solo saludo no parte nada", () => {
    expect(splitLeadingGreeting("tienen marcadores?")).toBeNull();
    expect(splitLeadingGreeting("hola")).toBeNull();
    expect(splitLeadingGreeting("holanda tiene envíos")).toBeNull();
  });
});

describe("«es de Paula» tras un traspaso del bot", () => {
  it("vence 24 h después de lo último que salió", () => {
    expect(handoffExpired({ needsOwnerReason: null, lastOwnerAt: ago(30 * 24 * HOUR), lastOutboundAt: ago(25 * HOUR) }, now)).toBe(true);
    expect(handoffExpired({ needsOwnerReason: null, lastOwnerAt: ago(30 * 24 * HOUR), lastOutboundAt: ago(23 * HOUR) }, now)).toBe(false);
    expect(handoffExpired({ needsOwnerReason: null, lastOwnerAt: ago(2 * HOUR), lastOutboundAt: ago(30 * HOUR) }, now)).toBe(false);
  });

  it("la pausa de Paula tiene su propia regla, y sin nada que haya salido no vence", () => {
    expect(handoffExpired({ needsOwnerReason: "owner_window", lastOwnerAt: ago(30 * 24 * HOUR) }, now)).toBe(false);
    expect(handoffExpired({ needsOwnerReason: null, lastOwnerAt: null, lastOutboundAt: null }, now)).toBe(false);
  });
});

describe("el botón de la página de un producto en una ráfaga", () => {
  const ctx: BurstContext = { offerOpen: false, orderPending: false, keywords: [{ id: "k", trigger: "hola", triggers: ["hola"], answer: "¡Hola!", buttons: [] } as never] };
  it("se queda con el producto aunque «hola» lo haga ver como saludo", () => {
    const messages = [{ id: "a", text: "¡Hola! 👋 Vengo de la tienda web y me interesa: Cuaderno Argollado Norma 5 Materias (ref CUA-NOR-5MA-GR-X-0123).", at: now }];
    const choice = chooseFromBurst(messages, ctx)!;
    expect(choice.webOrigin).toMatchObject({ pageType: "product", refs: ["CUA-NOR-5MA-GR-X-0123"] });
  });
});
