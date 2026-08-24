import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findProduct: vi.fn(),
  transaction: vi.fn(),
  verifyStoreOwner: vi.fn(),
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
  invalidateStoreProductsCache: vi.fn(),
}));
vi.mock("@/lib/inventory", () => ({
  createInventoryMovementBatch: vi.fn(),
}));
vi.mock("@/lib/product-slugs", () => ({
  synchronizeProductGroupSlugs: vi.fn(),
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    product: { findFirst: mocks.findProduct },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/slugify", () => ({ slugify: vi.fn() }));
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: mocks.verifyStoreOwner }));
vi.mock("@/lib/variant-generator", () => ({
  generateSemanticSKU: vi.fn(),
}));
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

import { POST } from "@/app/api/[storeId]/products/[productId]/convert-to-variants/review/route";

const identifiers = {
  color: "5e1d53da-1831-4dd7-9868-1db789af4811",
  design: "2053d4e6-5ea3-4a73-8714-1f2ed3d1f5a1",
  size: "7f28411c-213e-4f5f-a5e4-bff4bb5d3441",
};

const product = {
  id: "product-id",
  storeId: "store-id",
  productGroupId: null,
  isArchived: false,
  isKit: false,
  stock: 7,
  images: [
    { url: "https://example.com/first.jpg" },
    { url: "https://example.com/second.jpg" },
  ],
};

function requestBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Termo pastel",
    variants: [
      {
        imageUrl: "https://example.com/first.jpg",
        keepExistingProduct: true,
        stock: 4,
        color: { mode: "existing", id: identifiers.color },
        design: { mode: "existing", id: identifiers.design },
        sizeId: identifiers.size,
      },
      {
        imageUrl: "https://example.com/second.jpg",
        keepExistingProduct: false,
        stock: 3,
        color: { mode: "existing", id: identifiers.color },
        design: { mode: "new", name: "Floral" },
        sizeId: identifiers.size,
      },
    ],
    ...overrides,
  };
}

async function submit(body: Record<string, unknown>) {
  return POST(
    new Request(
      "https://admin.example.com/api/store-id/products/product-id/convert-to-variants/review",
      { method: "POST", body: JSON.stringify(body) },
    ),
    { params: { storeId: "store-id", productId: "product-id" } },
  );
}

describe("POST /api/[storeId]/products/[productId]/convert-to-variants/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockReturnValue({ userId: "owner-id" });
    mocks.findProduct.mockResolvedValue(product);
  });

  it("rejects an incomplete inventory distribution before it starts a transaction", async () => {
    const response = await submit(
      requestBody({
        variants: [
          { ...requestBody().variants[0], stock: 3 },
          { ...requestBody().variants[1], stock: 3 },
        ],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Distribuye exactamente todo el inventario actual entre las opciones",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a review that does not keep exactly one existing product", async () => {
    const response = await submit(
      requestBody({
        variants: requestBody().variants.map((variant) => ({
          ...variant,
          keepExistingProduct: false,
        })),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Selecciona exactamente una opción para conservar el producto actual",
    });
    expect(mocks.findProduct).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a selected image that is not part of the source product", async () => {
    const response = await submit(
      requestBody({
        variants: [
          requestBody().variants[0],
          {
            ...requestBody().variants[1],
            imageUrl: "https://example.com/other.jpg",
          },
        ],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Cada opción debe usar una imagen que pertenezca al producto actual",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
