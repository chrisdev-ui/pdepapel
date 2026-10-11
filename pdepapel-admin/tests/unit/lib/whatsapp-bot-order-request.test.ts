import { describe, expect, it } from "vitest";

import {
  ORDER_OFFER_WINDOW_MS,
  ORDER_TEMPLATES,
  ORDER_TEMPLATES_VERSION,
  areOrderRepliesApproved,
  formatOrderLine,
  isOfferFresh,
  isShippingCostQuestion,
  offeredProductId,
  orderTotal,
  parseAppendRequest,
  parseOrderReply,
} from "@/lib/whatsapp/bot-order-request";

/** «Sí» a un producto que ofreció el bot: qué cuenta como pedido y qué no. */
describe("parseOrderReply", () => {
  it.each([
    ["sí", 1],
    ["Sí!", 1],
    ["si porfa", 1],
    ["dale", 1],
    ["listo 💛", 1],
    ["lo quiero", 1],
    ["sí, 2", 2],
    ["quiero 3", 3],
    ["si quiero dos", 2],
    ["de una", 1],
    ["sí por favor", 1],
  ])("«%s» es un pedido de %i", (text, quantity) => {
    expect(parseOrderReply(text)).toEqual({ quantity, extra: null });
  });

  it.each(["no", "no gracias", "sí pero más tarde", "sí, ¿cuánto es el envío?", "luego te digo", "sí quiero el de Stitch", "hola", "tienen cuadernos?", "ok pero mañana", ""])(
    "«%s» no es un pedido",
    (text) => {
      expect(parseOrderReply(text)).toBeNull();
    },
  );

  it("separa lo que pide además en el mismo mensaje", () => {
    expect(parseOrderReply("sí, y también quiero 2 lapiceros")).toEqual({ quantity: 1, extra: { quantity: 2, query: "lapiceros" } });
    expect(parseOrderReply("si porfa, además un borrador")).toEqual({ quantity: 1, extra: { quantity: 1, query: "borrador" } });
  });

  it("devuelve la cantidad tal cual: el tope y el stock los decide el bot", () => {
    expect(parseOrderReply("quiero 50")?.quantity).toBe(50);
  });
});

describe("parseAppendRequest", () => {
  it("solo con «también», «además», «agrega» o «suma»", () => {
    expect(parseAppendRequest("y también 2 lapiceros")).toEqual({ quantity: 2, query: "lapiceros" });
    expect(parseAppendRequest("agrégale un borrador de nata")).toEqual({ quantity: 1, query: "borrador nata" });
    expect(parseAppendRequest("2 lapiceros")).toBeNull();
    expect(parseAppendRequest("¿y también tienen colores?")).toBeNull();
    expect(parseAppendRequest("también no, gracias")).toBeNull();
  });
});

describe("isShippingCostQuestion", () => {
  it.each(["cuánto es el envío?", "cuánto cuesta el domicilio?", "valor del envío a Cali", "cuanto cobran de envio"])("«%s» pregunta el envío", (text) => {
    expect(isShippingCostQuestion(text)).toBe(true);
  });
  it.each(["hacen envíos?", "cuánto cuesta el cuaderno?", "cuánto tarda en llegar?"])("«%s» no pregunta el valor del envío", (text) => {
    expect(isShippingCostQuestion(text)).toBe(false);
  });
});

describe("offeredProductId", () => {
  const offer = (body: string, ids: string[]) => ({ body, metadata: { shown: { ids, intent: "product.search" } } });

  it("un solo producto que cierra con «¿Lo quieres?» (o el viejo «¿Te lo aparto?»)", () => {
    expect(offeredProductId(offer("Sí 💛 Tengo Cuaderno en $33.000. ¿Lo quieres?", ["p1"]))).toBe("p1");
    expect(offeredProductId(offer("Sí 💛 Tengo Cuaderno en $33.000. ¿Te lo aparto?", ["p1"]))).toBe("p1");
  });

  it("no es oferta: agotado, «¿Te sirve?», varios productos o sin productos", () => {
    expect(offeredProductId(offer("Cuaderno se me agotó por ahora 💛 Si quieres te aviso apenas vuelva a entrar.", ["p1"]))).toBeNull();
    expect(offeredProductId(offer("De stitch no tengo 💛 Pero de cuadernos tengo Cuaderno en $33.000. ¿Te sirve?", ["p1"]))).toBeNull();
    expect(offeredProductId(offer("Sí, mira 💛 Tengo estos:\n• A\n• B\n¿Lo quieres?", ["p1", "p2"]))).toBeNull();
    expect(offeredProductId({ body: "¿Lo quieres?", metadata: null })).toBeNull();
    expect(offeredProductId(null)).toBeNull();
  });

  it("la oferta vale 30 minutos", () => {
    const now = new Date("2026-10-11T12:00:00Z");
    expect(isOfferFresh(new Date(now.getTime() - ORDER_OFFER_WINDOW_MS), now)).toBe(true);
    expect(isOfferFresh(new Date(now.getTime() - ORDER_OFFER_WINDOW_MS - 1), now)).toBe(false);
  });
});

describe("aprobación del grupo de pedidos", () => {
  it("apagado sin aprobación o con la huella de otra versión", () => {
    expect(areOrderRepliesApproved({ botCasualApprovedAt: null, botCasualVersion: null })).toBe(false);
    expect(areOrderRepliesApproved({ botCasualApprovedAt: new Date(), botCasualVersion: "otra" })).toBe(false);
    expect(areOrderRepliesApproved({ botCasualApprovedAt: new Date(), botCasualVersion: ORDER_TEMPLATES_VERSION })).toBe(true);
  });

  it("la huella cubre cada frase opcional del texto del envío", () => {
    expect(ORDER_TEMPLATES["shipping.quote"]("$250.000", "2 a 6 días")).toContain("Normalmente llega en 2 a 6 días.");
    expect(ORDER_TEMPLATES["shipping.quote"]("", "")).toBe(
      "El valor del envío depende de tu ciudad y lo cotiza la transportadora 💛 Paula te confirma el valor exacto.",
    );
  });
});

describe("el pedido dice el total, no el precio de una unidad", () => {
  const money = (value: number) => `$${value.toLocaleString("es-CO")}`;
  const items = [
    { productId: "a", name: "Tote bag Italia", quantity: 2, unitPrice: 35000, stockConfirmed: true },
    { productId: "b", name: "Lapicero", quantity: 3, unitPrice: 3500, stockConfirmed: true },
  ];

  it("cada línea con su subtotal y la suma de todas", () => {
    expect(formatOrderLine(items[0], money)).toBe("• Tote bag Italia × 2: $70.000");
    expect(orderTotal(items)).toBe(80500);
  });

  it("los textos llevan el total y aclaran que es sin envío", () => {
    expect(ORDER_TEMPLATES["order.requested.one"]("Tote bag Italia", 2, money(70000))).toBe(
      "¡Listo! 💛 Le paso tu pedido a Paula: Tote bag Italia × 2, total $70.000 (sin envío). Ella te escribe para confirmar envío y pago.",
    );
    const lines = items.map((item) => formatOrderLine(item, money)).join("\n");
    expect(ORDER_TEMPLATES["order.requested.many"](lines, money(orderTotal(items)))).toBe(
      "¡Listo! 💛 Le paso tu pedido a Paula:\n• Tote bag Italia × 2: $70.000\n• Lapicero × 3: $10.500\nTotal: $80.500 (sin envío)\nElla te escribe para confirmar envío y pago.",
    );
    expect(ORDER_TEMPLATES["order.appended"](lines, money(orderTotal(items)))).toContain("\nTotal: $80.500 (sin envío)\nPaula te escribe");
  });
});
