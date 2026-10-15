import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStoreOwner: vi.fn(),
  shippingFindFirst: vi.fn(),
}));

vi.mock("@/lib/store-access", () => ({ requireStoreOwner: mocks.requireStoreOwner }));
vi.mock("@/lib/prismadb", () => ({
  default: { shipping: { findFirst: mocks.shippingFindFirst } },
}));

import { ErrorFactory } from "@/lib/api-errors";
import { GET } from "@/app/api/[storeId]/orders/[orderId]/guide/route";

const params = { params: { storeId: "store-1", orderId: "order-1" } };
const request = new Request("https://admin.test/api/store-1/orders/order-1/guide");

describe("GET /api/[storeId]/orders/[orderId]/guide", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStoreOwner.mockResolvedValue("user_1");
  });

  it("answers 401 without a session and 403 for a non-owner, before reading anything", async () => {
    mocks.requireStoreOwner.mockRejectedValueOnce(ErrorFactory.Unauthenticated());
    expect((await GET(request, params)).status).toBe(401);
    mocks.requireStoreOwner.mockRejectedValueOnce(ErrorFactory.Unauthorized());
    expect((await GET(request, params)).status).toBe(403);
    expect(mocks.shippingFindFirst).not.toHaveBeenCalled();
  });

  it("answers 404 when the order has no stored guide, scoped to the store", async () => {
    mocks.shippingFindFirst.mockResolvedValue({ guidePdfBase64: null });
    expect((await GET(request, params)).status).toBe(404);
    expect(mocks.shippingFindFirst).toHaveBeenCalledWith({
      where: { storeId: "store-1", orderId: "order-1" },
      select: { guidePdfBase64: true },
    });
    mocks.shippingFindFirst.mockResolvedValue(null);
    expect((await GET(request, params)).status).toBe(404);
  });

  it("decodes the stored base64 into a private, uncached PDF", async () => {
    const pdf = Buffer.from("%PDF-1.4 guía");
    mocks.shippingFindFirst.mockResolvedValue({ guidePdfBase64: pdf.toString("base64") });
    const response = await GET(request, params);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(Buffer.from(await response.arrayBuffer()).equals(pdf)).toBe(true);
  });
});
