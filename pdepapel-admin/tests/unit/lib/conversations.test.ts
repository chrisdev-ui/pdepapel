import { describe, expect, it } from "vitest";

import {
  CONVERSATION_STATUS_LABELS,
  describeMedia,
  parseCartMetadata,
  previewMessage,
  resolveCart,
} from "@/lib/conversations";
import { ConversationStatus } from "@prisma/client";

const catalog = [
  { id: "p1", name: "Agenda Mini Azul aguamarina", sku: "AGE-CLS-AZU-XS-L-2868", price: 13000, stock: 5, isArchived: false },
  { id: "p2", name: "Sticker kawaii", sku: "STI-KAW-001", price: 5000, stock: 1, isArchived: false },
];

describe("parseCartMetadata", () => {
  it("reads a stored cart", () => {
    expect(
      parseCartMetadata({
        order: {
          catalogId: "1049887011264361",
          note: "",
          items: [{ sku: "AGE-CLS-AZU-XS-L-2868", quantity: 1, unitPrice: 13000, currency: "COP" }],
        },
      }),
    ).toEqual([{ sku: "AGE-CLS-AZU-XS-L-2868", quantity: 1, unitPrice: 13000, currency: "COP" }]);
  });

  it("returns null for anything that is not a readable cart", () => {
    for (const value of [null, undefined, {}, "x", { order: { items: [] } }, { order: { items: [{ quantity: 2 }] } }]) {
      expect(parseCartMetadata(value)).toBeNull();
    }
  });
});

describe("resolveCart", () => {
  it("matches WhatsApp items to products by SKU and totals with today's price", () => {
    const cart = resolveCart(
      [
        { sku: "AGE-CLS-AZU-XS-L-2868", quantity: 2, unitPrice: 13000, currency: "COP" },
        { sku: "STI-KAW-001", quantity: 1, unitPrice: 5000, currency: "COP" },
      ],
      catalog,
    );

    expect(cart.total).toBe(2 * 13000 + 5000);
    expect(cart.lines[0].product?.name).toBe("Agenda Mini Azul aguamarina");
    expect(cart.unresolved).toBe(0);
    expect(cart.priceChanged).toBe(0);
    expect(cart.insufficientStock).toBe(0);
  });

  it("flags a price that changed since the customer built the cart", () => {
    // Vio 11000, hoy vale 13000: la dueña tiene que saberlo antes de cotizar.
    const cart = resolveCart([{ sku: "AGE-CLS-AZU-XS-L-2868", quantity: 1, unitPrice: 11000, currency: "COP" }], catalog);

    expect(cart.priceChanged).toBe(1);
    expect(cart.total).toBe(13000);
    expect(cart.lines[0].quotedPrice).toBe(11000);
  });

  it("flags a line with not enough stock left", () => {
    const cart = resolveCart([{ sku: "STI-KAW-001", quantity: 4, unitPrice: 5000, currency: "COP" }], catalog);

    expect(cart.insufficientStock).toBe(1);
    expect(cart.lines[0].product?.stock).toBe(1);
  });

  it("keeps a line whose SKU is gone from the catalog instead of dropping it", () => {
    const cart = resolveCart([{ sku: "NO-EXISTE-1", quantity: 1, unitPrice: 9000, currency: "COP" }], catalog);

    expect(cart.unresolved).toBe(1);
    expect(cart.lines[0].product).toBeNull();
    // Un producto que ya no existe no suma al total.
    expect(cart.total).toBe(0);
  });
});

describe("previewMessage", () => {
  it("prefers the text and collapses whitespace", () => {
    expect(previewMessage("  hola   ¿cómo\nestás? ", null)).toBe("hola ¿cómo estás?");
  });

  it("falls back to the attachment kind in words", () => {
    expect(previewMessage(null, "image")).toBe("(Foto)");
    expect(previewMessage("", "order")).toBe("(Carrito del catálogo)");
    expect(previewMessage(null, null)).toBeNull();
  });

  it("truncates a long message", () => {
    const preview = previewMessage("a".repeat(200), null, 20);
    expect(preview).toHaveLength(21);
    expect(preview?.endsWith("…")).toBe(true);
  });
});

describe("labels", () => {
  it("names every conversation status in Spanish", () => {
    for (const status of Object.values(ConversationStatus)) {
      expect(CONVERSATION_STATUS_LABELS[status]).toBeTruthy();
    }
    expect(CONVERSATION_STATUS_LABELS.NEEDS_OWNER).toBe("Necesita respuesta");
  });

  it("describes attachments in words, and passes through unknown kinds", () => {
    expect(describeMedia("audio")).toBe("Nota de voz");
    expect(describeMedia("algo-nuevo")).toBe("algo-nuevo");
    expect(describeMedia(null)).toBeNull();
  });
});
