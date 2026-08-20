import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  deleteMany: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    customerAddress: {
      deleteMany: mocks.deleteMany,
      findMany: mocks.findMany,
    },
  },
}));
vi.mock("@/lib/cors", () => ({
  createCorsHeaders: () => ({
    "Access-Control-Allow-Origin": "https://papeleriapdepapel.com",
  }),
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } },
}));

import { GET } from "@/app/api/[storeId]/account/addresses/route";
import { DELETE } from "@/app/api/[storeId]/account/addresses/[addressId]/route";

const params = { storeId: "store-id" };

describe("customer address API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockReturnValue({ userId: "customer-id" });
    mocks.findMany.mockResolvedValue([]);
    mocks.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("lists only the signed-in customer's addresses for the current store", async () => {
    const response = await GET(
      new Request("https://admin.example.com/api/store-id/account/addresses"),
      { params },
    );

    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: "store-id", userId: "customer-id" },
      }),
    );
  });

  it("requires a signed-in account before returning address data", async () => {
    mocks.auth.mockReturnValue({ userId: null });

    const response = await GET(
      new Request("https://admin.example.com/api/store-id/account/addresses"),
      { params },
    );

    expect(response.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("deletes only an address owned by the signed-in customer", async () => {
    const response = await DELETE(
      new Request(
        "https://admin.example.com/api/store-id/account/addresses/address-id",
        {
          method: "DELETE",
        },
      ),
      { params: { ...params, addressId: "address-id" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "address-id",
        storeId: "store-id",
        userId: "customer-id",
      },
    });
  });
});
