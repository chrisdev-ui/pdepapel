import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  categoryFindMany: vi.fn(),
  sizeFindMany: vi.fn(),
  colorFindMany: vi.fn(),
  designFindMany: vi.fn(),
  redisGet: vi.fn(),
  redisIncr: vi.fn(),
  redisExpire: vi.fn(),
  redisSet: vi.fn(),
  generateText: vi.fn(),
  createGoogle: vi.fn(),
  env: { GEMINI_API_KEY: "gemini-test-key" as string | undefined },
}));

vi.mock("@clerk/nextjs", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: mocks.verifyStoreOwner }));
vi.mock("@/lib/env.mjs", () => ({ env: mocks.env }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    category: { findMany: mocks.categoryFindMany },
    size: { findMany: mocks.sizeFindMany },
    color: { findMany: mocks.colorFindMany },
    design: { findMany: mocks.designFindMany },
  },
}));
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({
      get: mocks.redisGet,
      incr: mocks.redisIncr,
      expire: mocks.redisExpire,
      set: mocks.redisSet,
    }),
  },
}));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: mocks.createGoogle,
}));
vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: vi.fn((options) => options) },
}));
vi.mock("@/lib/api-errors", () => {
  class AppError extends Error {
    constructor(
      message: string,
      public readonly statusCode = 500,
    ) {
      super(message);
    }
  }

  return {
    AppError,
    ErrorFactory: {
      Unauthenticated: () => new AppError("Unauthenticated", 401),
      MissingStoreId: () => new AppError("Missing store ID", 400),
      InvalidRequest: (message: string) => new AppError(message, 400),
    },
    handleErrorResponse: (error: { message?: string; statusCode?: number }) =>
      Response.json(
        { error: error.message ?? "Error interno del servidor" },
        { status: error.statusCode ?? 500 },
      ),
  };
});

import { POST } from "@/app/api/[storeId]/products/image-analysis/route";

describe("product image analysis route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.GEMINI_API_KEY = "gemini-test-key";
    mocks.auth.mockReturnValue({ userId: "owner-id" });
    mocks.categoryFindMany.mockResolvedValue([
      { id: "category-notebooks", name: "Cuadernos", type: { name: "Útiles" } },
    ]);
    mocks.sizeFindMany.mockResolvedValue([
      { id: "size-a5", name: "A5", value: "A5" },
    ]);
    mocks.colorFindMany.mockResolvedValue([
      { id: "color-rosa", name: "Rosa", value: "#F8B4C7" },
    ]);
    mocks.designFindMany.mockResolvedValue([
      { id: "design-floral", name: "Floral" },
    ]);
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisIncr.mockResolvedValue(1);
    mocks.redisExpire.mockResolvedValue(1);
    mocks.redisSet.mockResolvedValue("OK");
    mocks.createGoogle.mockReturnValue(vi.fn(() => "gemini-model"));
    mocks.generateText.mockResolvedValue({
      output: {
        suggestedBaseName: "Cuaderno argollado A5",
        suggestedNameOptions: ["Cuaderno argollado A5"],
        suggestedDescription: "Cuaderno argollado con portada floral.",
        brand: "Sanrio",
        categoryName: "Cuadernos",
        categoryIsDeterministic: true,
        sizeName: "A5",
        sizeIsDeterministic: true,
        colorName: "rosa",
        colorHex: "#F8B4C7",
        colorIsDeterministic: true,
        designName: "Floral",
        designIsDeterministic: true,
        gtin: {
          value: "4006381333931",
          evidence: "Se lee debajo del código de barras.",
        },
        mpn: {
          value: "SAN-AGENDA-A5",
          evidence: "Se lee como referencia en la etiqueta.",
        },
        variantRecommendation: {
          shouldCreateVariants: false,
          axes: [],
          evidence: null,
        },
        observations: ["La portada muestra flores."],
        limitations: [],
      },
    });
  });

  it("returns a review-only proposal matched to local taxonomy", async () => {
    const response = await POST(
      new Request("https://admin.example.com", {
        method: "POST",
        body: JSON.stringify({
          imageUrls: [
            "https://res.cloudinary.com/pdepapel/image/upload/v1/cuaderno.webp",
          ],
          categoryName: "Cuadernos",
        }),
      }),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      analysis: {
        suggestedBaseName: "Cuaderno argollado A5",
        brand: "Sanrio",
        categoryId: "category-notebooks",
        sizeId: "size-a5",
        colorId: "color-rosa",
        colorSource: "existing",
        designId: "design-floral",
      },
      remainingAnalysesToday: 19,
      reusedAnalysis: false,
    });
    expect(mocks.verifyStoreOwner).toHaveBeenCalledWith("owner-id", "store-id");
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(mocks.redisIncr).toHaveBeenCalledTimes(1);
    expect(mocks.redisSet).toHaveBeenCalledTimes(1);
  });

  it("reuses an identical cached proposal without consuming another analysis", async () => {
    mocks.redisGet
      .mockResolvedValueOnce({
        suggestedBaseName: "Cuaderno argollado A5",
        suggestedNameOptions: ["Cuaderno argollado A5"],
        suggestedDescription: "Cuaderno argollado con portada floral.",
        brand: "Sanrio",
        categoryName: "Cuadernos",
        categoryIsDeterministic: true,
        sizeName: "A5",
        sizeIsDeterministic: true,
        colorName: "rosa",
        colorHex: "#F8B4C7",
        colorIsDeterministic: true,
        designName: "Floral",
        designIsDeterministic: true,
        gtin: null,
        mpn: null,
        variantRecommendation: {
          shouldCreateVariants: false,
          axes: [],
          evidence: null,
        },
        observations: ["La portada muestra flores."],
        limitations: [],
      })
      .mockResolvedValueOnce(3);

    const response = await POST(
      new Request("https://admin.example.com", {
        method: "POST",
        body: JSON.stringify({
          imageUrls: [
            "https://res.cloudinary.com/pdepapel/image/upload/v1/cuaderno.webp",
          ],
          categoryName: "Cuadernos",
        }),
      }),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      analysis: { suggestedBaseName: "Cuaderno argollado A5" },
      remainingAnalysesToday: 17,
      reusedAnalysis: true,
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.redisIncr).not.toHaveBeenCalled();
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it("blocks URLs that are not catalog images before calling the model", async () => {
    const response = await POST(
      new Request("https://admin.example.com", {
        method: "POST",
        body: JSON.stringify({ imageUrls: ["https://example.com/image.jpg"] }),
      }),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(400);
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.redisIncr).not.toHaveBeenCalled();
  });

  it("does not call the provider when the free integration has no API key", async () => {
    mocks.env.GEMINI_API_KEY = undefined;

    const response = await POST(
      new Request("https://admin.example.com", {
        method: "POST",
        body: JSON.stringify({
          imageUrls: [
            "https://res.cloudinary.com/pdepapel/image/upload/v1/cuaderno.webp",
          ],
        }),
      }),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(503);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
