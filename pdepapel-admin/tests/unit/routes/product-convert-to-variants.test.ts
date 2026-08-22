import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findProduct: vi.fn(),
  transaction: vi.fn(),
  createProductGroup: vi.fn(),
  updateProduct: vi.fn(),
  invalidateStoreProductsCache: vi.fn(),
  verifyStoreOwner: vi.fn(),
  slugify: vi.fn(),
}));

class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

vi.mock("@clerk/nextjs", () => ({ auth: mocks.auth }));
vi.mock("@/lib/cache", () => ({
  invalidateStoreProductsCache: mocks.invalidateStoreProductsCache,
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    product: { findFirst: mocks.findProduct },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/slugify", () => ({ slugify: mocks.slugify }));
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: mocks.verifyStoreOwner }));
vi.mock("@/lib/api-errors", () => ({
  ErrorFactory: {
    Unauthenticated: () => new AppError("Autenticación requerida", 401),
    MissingStoreId: () => new AppError("Se requiere el ID de la tienda", 400),
    InvalidRequest: (message: string) => new AppError(message, 400),
    NotFound: (message: string) => new AppError(message, 404),
    Conflict: (message: string) => new AppError(message, 409),
  },
  handleErrorResponse: (error: unknown) => {
    const appError = error as AppError;
    return Response.json(
      { error: appError.message || "Error interno del servidor" },
      { status: appError.statusCode || 500 },
    );
  },
}));

import { POST } from "@/app/api/[storeId]/products/[productId]/convert-to-variants/route";

const product = {
  id: "product-id",
  storeId: "store-id",
  name: "Termo pastel rosa",
  description: "Termo de acero",
  brand: "P de Papel",
  productGroupId: null,
  isArchived: false,
  isKit: false,
  stock: 7,
  sku: "TRO-CLS-PAS-M-P-1164",
  images: [
    { url: "https://example.com/cover.jpg", isMain: true },
    { url: "https://example.com/detail.jpg", isMain: false },
  ],
};

describe("POST /api/[storeId]/products/[productId]/convert-to-variants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockReturnValue({ userId: "owner-id" });
    mocks.findProduct.mockResolvedValue(product);
    mocks.slugify.mockReturnValue("termo-pastel");
    mocks.createProductGroup.mockResolvedValue({ id: "group-id" });
    mocks.updateProduct.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        productGroup: { create: mocks.createProductGroup },
        product: { updateMany: mocks.updateProduct },
      }),
    );
  });

  it("keeps the existing product identity and inventory when creating its group", async () => {
    const response = await POST(
      new Request(
        "https://admin.example.com/api/store-id/products/product-id/convert-to-variants",
        {
          method: "POST",
          body: JSON.stringify({ name: "Termo pastel" }),
        },
      ),
      { params: { storeId: "store-id", productId: "product-id" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      productGroupId: "group-id",
    });
    expect(mocks.createProductGroup).toHaveBeenCalledWith({
      data: {
        storeId: "store-id",
        name: "Termo pastel",
        slug: "termo-pastel",
        description: product.description,
        brand: product.brand,
        images: {
          createMany: {
            data: product.images,
          },
        },
      },
    });
    expect(mocks.updateProduct).toHaveBeenCalledWith({
      where: {
        id: product.id,
        storeId: "store-id",
        productGroupId: null,
      },
      data: { productGroupId: "group-id" },
    });
    expect(mocks.invalidateStoreProductsCache).toHaveBeenCalledWith(
      "store-id",
      product.id,
    );
  });

  it("refuses to convert an already grouped product", async () => {
    mocks.findProduct.mockResolvedValue({
      ...product,
      productGroupId: "existing-group-id",
    });

    const response = await POST(
      new Request(
        "https://admin.example.com/api/store-id/products/product-id/convert-to-variants",
        {
          method: "POST",
          body: JSON.stringify({ name: "Termo pastel" }),
        },
      ),
      { params: { storeId: "store-id", productId: "product-id" } },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Este producto ya pertenece a un grupo",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not invalidate the catalog when another conversion wins the race", async () => {
    mocks.updateProduct.mockResolvedValue({ count: 0 });

    const response = await POST(
      new Request(
        "https://admin.example.com/api/store-id/products/product-id/convert-to-variants",
        {
          method: "POST",
          body: JSON.stringify({ name: "Termo pastel" }),
        },
      ),
      { params: { storeId: "store-id", productId: "product-id" } },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "El producto cambió mientras se convertía. Actualiza la página e inténtalo de nuevo",
    });
    expect(mocks.invalidateStoreProductsCache).not.toHaveBeenCalled();
  });
});
