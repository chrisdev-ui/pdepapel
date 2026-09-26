import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStoreOwner: vi.fn(),
  paymentFindFirst: vi.fn(),
  fetchProof: vi.fn(),
}));

vi.mock("@/lib/store-access", () => ({ requireStoreOwner: mocks.requireStoreOwner }));
vi.mock("@/lib/prismadb", () => ({
  default: { paymentDetails: { findFirst: mocks.paymentFindFirst } },
}));
vi.mock("@/lib/payment-proofs", () => ({
  fetchPaymentProof: mocks.fetchProof,
  PaymentProofStorageNotConfiguredError: class extends Error {},
}));

import { ErrorFactory } from "@/lib/api-errors";
import { GET } from "@/app/api/[storeId]/orders/[orderId]/payment-proof/route";

const params = { params: { storeId: "store-1", orderId: "order-1" } };
const request = new Request("https://admin.test/api/store-1/orders/order-1/payment-proof");
const proofKey = "comprobantes/store-1/0f3a9c1e-7b2d-4c8e-9a1f-2b3c4d5e6f70.jpg";

describe("GET /api/[storeId]/orders/[orderId]/payment-proof", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStoreOwner.mockResolvedValue("user_1");
  });

  it("answers 401 without a session and 403 for a non-owner, before reading anything", async () => {
    mocks.requireStoreOwner.mockRejectedValueOnce(ErrorFactory.Unauthenticated());
    expect((await GET(request, params)).status).toBe(401);
    mocks.requireStoreOwner.mockRejectedValueOnce(ErrorFactory.Unauthorized());
    expect((await GET(request, params)).status).toBe(403);
    expect(mocks.paymentFindFirst).not.toHaveBeenCalled();
    expect(mocks.fetchProof).not.toHaveBeenCalled();
  });

  it("answers 404 when the order has no proof, scoped to the store", async () => {
    mocks.paymentFindFirst.mockResolvedValue({ proofKey: null });
    expect((await GET(request, params)).status).toBe(404);
    expect(mocks.paymentFindFirst).toHaveBeenCalledWith({
      where: { storeId: "store-1", orderId: "order-1" },
      select: { proofKey: true },
    });
    mocks.paymentFindFirst.mockResolvedValue(null);
    expect((await GET(request, params)).status).toBe(404);
    expect(mocks.fetchProof).not.toHaveBeenCalled();
  });

  it("streams the bytes privately and never reveals the storage location", async () => {
    mocks.paymentFindFirst.mockResolvedValue({ proofKey });
    mocks.fetchProof.mockResolvedValue({
      body: new Uint8Array([9, 8, 7]),
      contentType: "image/jpeg",
    });
    const response = await GET(request, params);
    expect(response.status).toBe(200);
    expect(mocks.fetchProof).toHaveBeenCalledWith(proofKey, "store-1");
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]));
    for (const [, value] of Array.from(response.headers.entries())) {
      expect(value).not.toMatch(/cloudflare|r2|comprobantes/);
    }
  });

  it("answers 404 when the stored key is not a proof of this store or the object is gone", async () => {
    mocks.paymentFindFirst.mockResolvedValue({ proofKey });
    mocks.fetchProof.mockResolvedValue(null);
    expect((await GET(request, params)).status).toBe(404);
  });
});
