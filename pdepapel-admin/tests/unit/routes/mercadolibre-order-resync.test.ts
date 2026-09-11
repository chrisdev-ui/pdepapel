import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  findConnection: vi.fn(),
  findOrder: vi.fn(),
  releaseException: vi.fn(),
  getResource: vi.fn(),
  synchronize: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  verifyStoreOwner: mocks.verifyStoreOwner,
  CACHE_HEADERS: { NO_CACHE: {} },
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceConnection: { findUnique: mocks.findConnection },
    marketplaceOrder: {
      findUnique: mocks.findOrder,
      updateMany: mocks.releaseException,
    },
  },
}));
vi.mock("@/lib/mercadolibre/client", () => ({
  getMercadoLibreResource: mocks.getResource,
}));
vi.mock("@/lib/mercadolibre/order-sync", () => ({
  synchronizeMercadoLibreOrder: mocks.synchronize,
}));

import { POST } from "@/app/api/[storeId]/marketplaces/mercadolibre/orders/[externalOrderId]/resync/route";

const params = { storeId: "store-1", externalOrderId: "2000017813937484" };

describe("POST /marketplaces/mercadolibre/orders/[id]/resync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user-1" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
    mocks.findConnection.mockResolvedValue({ id: "conn-1", status: "CONNECTED" });
    mocks.releaseException.mockResolvedValue({ count: 1 });
  });

  it("keeps the EXCEPTION flag when Mercado Libre cannot be read", async () => {
    mocks.findOrder.mockResolvedValueOnce({ id: "mo-1", inventoryStatus: "EXCEPTION" });
    mocks.getResource.mockRejectedValueOnce(new Error("Mercado Libre respondió 503"));

    const response = await POST(new Request("http://localhost"), { params });

    expect(response.status).toBe(400);
    // Antes se liberaba la excepción ANTES de leer: la venta quedaba NOT_APPLIED e invisible.
    expect(mocks.releaseException).not.toHaveBeenCalled();
    expect(mocks.synchronize).not.toHaveBeenCalled();
  });

  it("releases the exception only after the sale was read, then re-synchronizes", async () => {
    mocks.findOrder
      .mockResolvedValueOnce({ id: "mo-1", inventoryStatus: "EXCEPTION" })
      .mockResolvedValueOnce({
        inventoryStatus: "DECREMENTED",
        inventoryError: null,
        items: [{ title: "Cuaderno", sku: "CUA-1", productId: "p1" }],
      });
    mocks.getResource.mockResolvedValueOnce({ id: "2000017813937484" });
    mocks.synchronize.mockResolvedValueOnce({ inventoryChanged: true, needsAttention: false });

    const response = await POST(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    expect(mocks.releaseException).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "mo-1", inventoryStatus: "EXCEPTION" } }),
    );
    expect(mocks.releaseException.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.getResource.mock.invocationCallOrder[0],
    );
    await expect(response.json()).resolves.toMatchObject({
      inventoryChanged: true,
      inventoryStatus: "DECREMENTED",
      linkedItems: 1,
      totalItems: 1,
    });
  });
});
