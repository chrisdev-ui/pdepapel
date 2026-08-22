import { beforeEach, describe, expect, it, vi } from "vitest";

const productId = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const changeId = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  findProducts: vi.fn(),
  findGroups: vi.fn(),
  findChanges: vi.fn(),
  productUpdate: vi.fn(),
  groupUpdate: vi.fn(),
  changeCreate: vi.fn(),
  changeUpdate: vi.fn(),
  transactionProductFindFirst: vi.fn(),
  transactionGroupFindFirst: vi.fn(),
  invalidateStoreProductsCache: vi.fn(),
}));

const transaction = {
  product: {
    update: mocks.productUpdate,
    findFirst: mocks.transactionProductFindFirst,
  },
  productGroup: {
    update: mocks.groupUpdate,
    findFirst: mocks.transactionGroupFindFirst,
  },
  productNamingChange: {
    create: mocks.changeCreate,
    update: mocks.changeUpdate,
  },
};

vi.mock("@clerk/nextjs", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: mocks.verifyStoreOwner }));
vi.mock("@/lib/cache", () => ({
  invalidateStoreProductsCache: mocks.invalidateStoreProductsCache,
}));
vi.mock("@/lib/api-errors", () => ({
  ErrorFactory: {
    Unauthenticated: () => new Error("Unauthenticated"),
    MissingStoreId: () => new Error("Missing store ID"),
    InvalidRequest: (message: string) => new Error(message),
    NotFound: (message: string) => new Error(message),
  },
  handleErrorResponse: () => new Response(null, { status: 500 }),
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    product: { findMany: mocks.findProducts },
    productGroup: { findMany: mocks.findGroups },
    productNamingChange: { findMany: mocks.findChanges },
    $transaction: (callback: (client: typeof transaction) => unknown) =>
      callback(transaction),
  },
}));

import { PATCH, POST } from "@/app/api/[storeId]/products/naming/route";

describe("product naming route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockReturnValue({ userId: "owner-id" });
    mocks.findProducts.mockResolvedValue([
      { id: productId, name: "Nombre antiguo", slug: "slug-existente" },
    ]);
    mocks.findGroups.mockResolvedValue([]);
    mocks.changeCreate.mockResolvedValue({
      id: changeId,
      entityType: "PRODUCT",
      entityId: productId,
      previousName: "Nombre antiguo",
      nextName: "Nombre nuevo",
    });
  });

  it("changes only the name, keeps the URL untouched, and records history", async () => {
    const response = await POST(
      new Request("https://admin.example.com", {
        method: "POST",
        body: JSON.stringify({
          changes: [
            {
              entityType: "PRODUCT",
              entityId: productId,
              name: "Nombre nuevo",
            },
          ],
        }),
      }),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyStoreOwner).toHaveBeenCalledWith("owner-id", "store-id");
    expect(mocks.productUpdate).toHaveBeenCalledWith({
      where: { id: productId },
      data: { name: "Nombre nuevo" },
    });
    expect(mocks.productUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: expect.anything() }),
      }),
    );
    expect(mocks.changeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          previousName: "Nombre antiguo",
          nextName: "Nombre nuevo",
          storeId: "store-id",
        }),
      }),
    );
    expect(mocks.invalidateStoreProductsCache).toHaveBeenCalledWith("store-id");
  });

  it("skips unchanged names without invalidating the catalog", async () => {
    const response = await POST(
      new Request("https://admin.example.com", {
        method: "POST",
        body: JSON.stringify({
          changes: [
            {
              entityType: "PRODUCT",
              entityId: productId,
              name: "Nombre antiguo",
            },
          ],
        }),
      }),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.productUpdate).not.toHaveBeenCalled();
    expect(mocks.changeCreate).not.toHaveBeenCalled();
    expect(mocks.invalidateStoreProductsCache).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ skippedCount: 1 });
  });

  it("restores a recent name only when it has not changed again", async () => {
    mocks.findChanges.mockResolvedValue([
      {
        id: changeId,
        entityType: "PRODUCT",
        entityId: productId,
        previousName: "Nombre antiguo",
        nextName: "Nombre nuevo",
      },
    ]);
    mocks.transactionProductFindFirst.mockResolvedValue({
      id: productId,
      name: "Nombre nuevo",
    });

    const response = await PATCH(
      new Request("https://admin.example.com", {
        method: "PATCH",
        body: JSON.stringify({ changeIds: [changeId] }),
      }),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.productUpdate).toHaveBeenCalledWith({
      where: { id: productId },
      data: { name: "Nombre antiguo" },
    });
    expect(mocks.changeUpdate).toHaveBeenCalledWith({
      where: { id: changeId },
      data: expect.objectContaining({ revertedBy: "owner-id" }),
    });
    expect(mocks.invalidateStoreProductsCache).toHaveBeenCalledWith("store-id");
  });

  it("rejects a duplicate product or group target in the same batch", async () => {
    const response = await POST(
      new Request("https://admin.example.com", {
        method: "POST",
        body: JSON.stringify({
          changes: [
            {
              entityType: "PRODUCT_GROUP",
              entityId: groupId,
              name: "Grupo uno",
            },
            {
              entityType: "PRODUCT_GROUP",
              entityId: groupId,
              name: "Grupo dos",
            },
          ],
        }),
      }),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(500);
    expect(mocks.findProducts).not.toHaveBeenCalled();
  });
});
