import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertNoForbiddenKeys } from "../../helpers/forbidden-keys";

const mocks = vi.hoisted(() => ({ role: "owner" as "owner" | "viewer" }));

const card = {
  id: "gc1",
  codeLast4: "1234",
  initialAmount: 50000,
  balance: 20000,
  status: "ACTIVE",
  purchaseOrderId: "o1",
  buyerEmail: "compradora@example.test",
  recipientName: "Quien recibe",
  recipientEmail: "recibe@example.test",
  message: "Feliz día",
  issuedAt: null,
  deliveredAt: null,
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  purchaseOrder: { id: "o1", orderNumber: "ORD-1", fullName: "Compradora", status: "PAID", paidAt: null },
  movements: [{ id: "m1", type: "ISSUE", amount: 50000, balanceAfter: 50000, reason: null, orderId: "o1", createdBy: null, createdAt: new Date() }],
  redemptions: [],
};

vi.mock("@/lib/store-access", () => ({ requireStoreRead: async () => ({ userId: "u", role: mocks.role }) }));
vi.mock("@/lib/utils", () => ({ CACHE_HEADERS: { NO_CACHE: {} } }));
vi.mock("@/lib/prismadb", () => ({ default: { giftCard: { findMany: async () => [card], findFirst: async () => card } } }));

import { GET as LIST } from "@/app/api/[storeId]/gift-cards/route";
import { GET as DETAIL } from "@/app/api/[storeId]/gift-cards/[giftCardId]/route";

const list = async () => (await LIST(new Request("https://admin.test/x"), { params: { storeId: "s" } })).json();
const detail = async () => (await DETAIL(new Request("https://admin.test/x"), { params: { storeId: "s", giftCardId: "gc1" } })).json();

/** Tarjetas de regalo por API: la página escondía los correos, las rutas no. */
describe("GET /gift-cards y /gift-cards/[id]", () => {
  beforeEach(() => {
    mocks.role = "owner";
  });

  it("la cuenta de solo lectura ve saldo, estado y movimientos, sin quién compra, para quién ni el mensaje", async () => {
    mocks.role = "viewer";
    const all = await list();
    const one = await detail();
    assertNoForbiddenKeys(all, "viewer");
    assertNoForbiddenKeys(one, "viewer");
    expect(one).not.toHaveProperty("message");
    expect(one).toMatchObject({ balance: 20000, status: "ACTIVE", purchaseOrder: { orderNumber: "ORD-1" } });
    expect(one.movements).toHaveLength(1);
  });

  it("la dueña ve todo", async () => {
    expect((await list()).cards[0]).toMatchObject({ buyerEmail: "compradora@example.test", recipientName: "Quien recibe" });
    expect(await detail()).toMatchObject({ message: "Feliz día", purchaseOrder: { fullName: "Compradora" } });
  });
});
