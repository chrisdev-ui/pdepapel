import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStoreOwner: vi.fn(),
  createFairSale: vi.fn(),
}));

vi.mock("@/lib/store-access", () => ({ requireStoreOwner: mocks.requireStoreOwner }));
vi.mock("@/lib/fair-events", () => ({ createFairSale: mocks.createFairSale }));

import { ErrorFactory } from "@/lib/api-errors";
import { POST } from "@/app/api/[storeId]/fair-events/[fairEventId]/sales/route";

const params = { params: { storeId: "store-1", fairEventId: "fair-1" } };
const post = (body: unknown) =>
  POST(
    new Request("https://admin.test/api/store-1/fair-events/fair-1/sales", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    params,
  );

describe("POST /api/[storeId]/fair-events/[fairEventId]/sales", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStoreOwner.mockResolvedValue("user_1");
    mocks.createFairSale.mockResolvedValue({ order: { orderNumber: "F-1" }, duplicate: false });
  });

  it("passes the transfer reference and the proof key through to the sale", async () => {
    const response = await post({
      items: [{ productId: "p-1", quantity: 1 }],
      paymentMethod: "BankTransfer",
      idempotencyKey: "abcdefghijkl",
      transactionId: "TRX-9981",
      proofKey: "comprobantes/store-1/0f3a9c1e-7b2d-4c8e-9a1f-2b3c4d5e6f70.jpg",
    });
    expect(response.status).toBe(201);
    expect(mocks.createFairSale).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        fairEventId: "fair-1",
        userId: "user_1",
        paymentMethod: "BankTransfer",
        transactionId: "TRX-9981",
        proofKey: "comprobantes/store-1/0f3a9c1e-7b2d-4c8e-9a1f-2b3c4d5e6f70.jpg",
      }),
    );
  });

  it("normalises missing or non-string reference and proof to null", async () => {
    await post({ items: [{ productId: "p-1", quantity: 1 }], paymentMethod: "CASH", idempotencyKey: "abcdefghijkl", proofKey: 42 });
    expect(mocks.createFairSale).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: null, proofKey: null }),
    );
  });

  it("still only accepts cash or transfer", async () => {
    const response = await post({ items: [], paymentMethod: "Bold", idempotencyKey: "abcdefghijkl" });
    expect(response.status).toBe(400);
    expect(mocks.createFairSale).not.toHaveBeenCalled();
  });

  it("requires the owner session", async () => {
    mocks.requireStoreOwner.mockRejectedValueOnce(ErrorFactory.Unauthorized());
    expect((await post({ items: [], paymentMethod: "CASH", idempotencyKey: "abcdefghijkl" })).status).toBe(403);
  });
});
