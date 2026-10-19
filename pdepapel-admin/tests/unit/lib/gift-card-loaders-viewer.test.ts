import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertNoForbiddenKeys } from "../../helpers/forbidden-keys";

const mocks = vi.hoisted(() => ({ role: "owner" as "owner" | "viewer" }));

const card = {
  id: "gc1",
  codeLast4: "1234",
  initialAmount: 50000,
  balance: 20000,
  status: "ACTIVE",
  buyerEmail: "compradora@example.test",
  recipientName: "Quien recibe",
  recipientEmail: "recibe@example.test",
  message: "Feliz día",
  issuedAt: new Date(),
  deliveredAt: null,
  purchaseOrder: { id: "o1", orderNumber: "ORD-1", fullName: "Compradora", status: "PAID", paidAt: null, total: 50000 },
  movements: [],
  redemptions: [],
  _count: { redemptions: 0 },
};

vi.mock("next/headers", () => ({ headers: () => new Map() }));
vi.mock("@/lib/store-access", () => ({ requireStoreRead: async () => ({ userId: "u", role: mocks.role }) }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    giftCard: { findMany: async () => [card], findFirst: async () => card },
    giftCardDenomination: { findMany: async () => [] },
  },
}));

import { getGiftCards } from "@/app/(dashboard)/[storeId]/(routes)/tarjetas-regalo/server/get-gift-cards";
import { getGiftCard } from "@/app/(dashboard)/[storeId]/(routes)/tarjetas-regalo/[giftCardId]/server/get-gift-card";

/**
 * La página de Tarjetas de regalo escondía los correos pero mandaba a la
 * cuenta de solo lectura el nombre de quien compró, el de quien recibe y el
 * mensaje (la revisión manual lo encontró en el HTML).
 */
describe("Tarjetas de regalo (cargadores de página)", () => {
  beforeEach(() => {
    mocks.role = "owner";
  });

  it("solo lectura: lista y ficha sin nombres, correos ni mensaje", async () => {
    mocks.role = "viewer";
    const list = await getGiftCards("s");
    const one = await getGiftCard("s", "gc1");
    assertNoForbiddenKeys(list.cards, "viewer");
    assertNoForbiddenKeys(one, "viewer");
    expect(one).not.toHaveProperty("message");
    expect(one).toMatchObject({ balance: 20000, canWrite: false, purchaseOrder: { orderNumber: "ORD-1" } });
  });

  it("la dueña ve todo", async () => {
    expect((await getGiftCards("s")).cards[0]).toMatchObject({ recipientName: "Quien recibe", purchaseOrder: { fullName: "Compradora" } });
    expect(await getGiftCard("s", "gc1")).toMatchObject({ message: "Feliz día", buyerEmail: "compradora@example.test" });
  });
});
