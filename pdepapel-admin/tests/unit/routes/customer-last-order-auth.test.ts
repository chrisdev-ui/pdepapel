import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkIfStoreOwner: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prismadb", () => ({
  default: { order: { findFirst: mocks.findFirst } },
}));
vi.mock("@/lib/utils", () => ({
  checkIfStoreOwner: mocks.checkIfStoreOwner,
}));

import { GET } from "@/app/api/[storeId]/customers/[userId]/last-order/route";

describe("customer last-order lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockReturnValue({ userId: "admin-id" });
    mocks.checkIfStoreOwner.mockResolvedValue(true);
    mocks.findFirst.mockResolvedValue({ address: "Calle 10" });
  });

  it("does not expose a customer's delivery data without authentication", async () => {
    mocks.auth.mockReturnValue({ userId: null });

    const response = await GET(
      new Request(
        "https://admin.example.com/api/store-id/customers/customer-id/last-order",
      ),
      { params: { storeId: "store-id", userId: "customer-id" } },
    );

    expect(response.status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("allows the private lookup only to an owner of the requested store", async () => {
    const response = await GET(
      new Request(
        "https://admin.example.com/api/store-id/customers/customer-id/last-order",
      ),
      { params: { storeId: "store-id", userId: "customer-id" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.checkIfStoreOwner).toHaveBeenCalledWith(
      "admin-id",
      "store-id",
    );
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: "store-id", userId: "customer-id" },
      }),
    );
  });
});
