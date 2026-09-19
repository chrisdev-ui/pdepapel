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

// La ruta ahora borra fotos en Cloudinary después de confirmar; aquí no se prueba.
vi.mock("@/lib/cloudinary-cleanup", () => ({
  deleteCloudinaryImages: vi.fn().mockResolvedValue({ deleted: 0, kept: 0 }),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
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
import { createInventoryMovementBatch } from "@/lib/inventory";
import { generateSemanticSKU } from "@/lib/variant-generator";

const identifiers = {
  color: "5e1d53da-1831-4dd7-9868-1db789af4811",
  design: "2053d4e6-5ea3-4a73-8714-1f2ed3d1f5a1",
  size: "7f28411c-213e-4f5f-a5e4-bff4bb5d3441",
};

const product = {
  id: "product-id",
  storeId: "store-id",
  name: "Termo pastel rosa",
  description: "Termo de acero",
  categoryId: "category-id",
  brand: "P de Papel",
  price: 17500,
  acqPrice: 11000,
  transportationCost: 1200,
  shippingProfileId: "profile-id",
  availableAt: new Date("2026-09-01T00:00:00.000Z"),
  supplierId: "supplier-id",
  isFeatured: false,
  productGroupId: null,
  isArchived: false,
  isKit: false,
  stock: 7,
  images: [
    { url: "https://example.com/first.jpg", isMain: true },
    { url: "https://example.com/second.jpg", isMain: false },
  ],
  catalogOptionValues: [{ optionId: "option-id", optionValueId: "value-id" }],
  offers: [{ offerId: "offer-id" }],
};

/** Transacción con lo justo para crear el grupo y una opción nueva. */
function transactionMocks() {
  const tx = {
    category: { findFirst: vi.fn().mockResolvedValue({ id: "category-id", name: "Termos" }) },
    productGroup: { create: vi.fn().mockResolvedValue({ id: "group-id" }) },
    color: { findFirst: vi.fn().mockResolvedValue({ id: identifiers.color, name: "Rosa", value: "#FFC0CB" }) },
    design: {
      // Por id: el diseño actual existe; por nombre («Floral»): no, se crea.
      findFirst: vi.fn().mockImplementation(async ({ where }: { where: { id?: string } }) =>
        where.id ? { id: identifiers.design, name: "Clásico" } : null,
      ),
      create: vi.fn().mockResolvedValue({ id: "design-new", name: "Floral" }),
    },
    size: { findFirst: vi.fn().mockResolvedValue({ id: identifiers.size, name: "Único", value: "U" }) },
    product: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "created-id" }),
    },
    image: { deleteMany: vi.fn(), create: vi.fn() },
  };
  mocks.transaction.mockImplementation(async (callback: (client: unknown) => unknown) => callback(tx));
  return tx;
}

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

  /**
   * Fase 2B: la opción nueva perdía envío por unidad, perfil de envío,
   * «disponible desde», opciones para clientes y ofertas, y el reparto se
   * registraba como ajuste manual suelto.
   */
  it("carries shipping fields, catalog options and offers to the new option and logs the split as a conversion", async () => {
    const tx = transactionMocks();
    vi.mocked(generateSemanticSKU).mockReturnValue("TER-FLO-ROS-U-1");

    const response = await submit(requestBody());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      productGroupId: "group-id",
      createdProductIds: ["created-id"],
      copiedOffers: 1,
    });
    const created = tx.product.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      transportationCost: 1200,
      shippingProfileId: "profile-id",
      availableAt: product.availableAt,
      supplierId: "supplier-id",
      hasNoProductIdentifier: true,
      productGroupId: "group-id",
      catalogOptionValues: {
        createMany: { data: [{ storeId: "store-id", optionId: "option-id", optionValueId: "value-id" }] },
      },
      offers: { createMany: { data: [{ offerId: "offer-id" }] } },
    });
    expect(created).not.toHaveProperty("gtin");

    const movements = vi.mocked(createInventoryMovementBatch).mock.calls[0][1];
    expect(movements).toEqual([
      expect.objectContaining({ productId: "product-id", type: "VARIANT_CONVERSION", quantity: -3, referenceId: "group-id" }),
      expect.objectContaining({ productId: "created-id", type: "VARIANT_CONVERSION", quantity: 3, referenceId: "group-id" }),
    ]);
  });

  it("leaves the offers behind when the owner unticks «copiar ofertas»", async () => {
    const tx = transactionMocks();
    const response = await submit(requestBody({ copyOffers: false }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ copiedOffers: 0 });
    expect(tx.product.create.mock.calls[0][0].data.offers).toEqual({ createMany: { data: [] } });
  });

  it("creates the group with only the current product when no other option is added", async () => {
    const tx = transactionMocks();
    const response = await submit(
      requestBody({ variants: [{ ...requestBody().variants[0], stock: 7 }] }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      productGroupId: "group-id",
      createdProductIds: [],
      copiedOffers: 0,
    });
    expect(tx.product.create).not.toHaveBeenCalled();
    // Todo el stock se queda en el producto: no hay movimiento que registrar.
    expect(vi.mocked(createInventoryMovementBatch).mock.calls[0][1]).toEqual([]);
  });
});
