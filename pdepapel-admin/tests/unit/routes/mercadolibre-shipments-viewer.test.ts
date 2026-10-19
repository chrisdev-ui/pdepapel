import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertNoForbiddenKeys } from "../../helpers/forbidden-keys";

const mocks = vi.hoisted(() => ({ role: "owner" as "owner" | "viewer" }));

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "u" }) }));
vi.mock("@/lib/store-access", () => ({ requireStoreRead: async () => ({ userId: "u", role: mocks.role }) }));
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: vi.fn(), CACHE_HEADERS: { NO_CACHE: {} } }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceConnection: { findUnique: async () => ({ id: "conn-1" }) },
    marketplaceShipment: {
      findMany: async () => [
        {
          id: "s1",
          externalShipmentId: "4000",
          status: "shipped",
          substatus: null,
          logisticsType: "fulfillment",
          trackingNumber: "TRK-123",
          lastRemoteUpdateAt: null,
          marketplaceOrder: { id: "mo1", externalOrderId: "2000", buyerName: "Compradora", status: "paid" },
        },
      ],
    },
  },
}));

import { GET } from "@/app/api/[storeId]/marketplaces/mercadolibre/shipments/route";

const call = async () => (await GET(new Request("https://admin.test/x"), { params: { storeId: "store-1" } })).json();

/** Envíos de Mercado Libre: el ayudante de limpieza estaba importado y nunca se aplicaba. */
describe("GET /marketplaces/mercadolibre/shipments", () => {
  beforeEach(() => {
    mocks.role = "owner";
  });

  it("la cuenta de solo lectura no recibe guía ni nombre de quien compra", async () => {
    mocks.role = "viewer";
    const rows = await call();
    assertNoForbiddenKeys(rows, "viewer");
    expect(rows[0]).toMatchObject({ id: "s1", status: expect.any(String), marketplaceOrder: { externalOrderId: "2000" } });
  });

  it("la dueña los sigue viendo", async () => {
    const rows = await call();
    expect(rows[0]).toMatchObject({ trackingNumber: "TRK-123", marketplaceOrder: { buyerName: "Compradora" } });
  });
});
