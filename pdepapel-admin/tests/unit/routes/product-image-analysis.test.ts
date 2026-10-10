import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  categoryFindMany: vi.fn(),
  sizeFindMany: vi.fn(),
  colorFindMany: vi.fn(),
  designFindMany: vi.fn(),
  imageFindMany: vi.fn(),
  fetchImage: vi.fn(),
  redisGet: vi.fn(),
  redisIncr: vi.fn(),
  redisExpire: vi.fn(),
  redisSet: vi.fn(),
  redisDecr: vi.fn(),
  generateText: vi.fn(),
  createGoogle: vi.fn(),
  createOpenAI: vi.fn(),
  env: {
    GEMINI_API_KEY: "gemini-test-key" as string | undefined,
    OPENAI_API_KEY: undefined as string | undefined,
  },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: mocks.verifyStoreOwner }));
vi.mock("@/lib/env.mjs", () => ({ env: mocks.env }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    category: { findMany: mocks.categoryFindMany },
    size: { findMany: mocks.sizeFindMany },
    color: { findMany: mocks.colorFindMany },
    design: { findMany: mocks.designFindMany },
    image: { findMany: mocks.imageFindMany },
  },
}));
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({
      get: mocks.redisGet,
      incr: mocks.redisIncr,
      expire: mocks.redisExpire,
      set: mocks.redisSet,
      decr: mocks.redisDecr,
    }),
  },
}));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: mocks.createOpenAI }));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: mocks.createGoogle,
}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
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

import {
  maxDuration,
  POST,
} from "@/app/api/[storeId]/products/image-analysis/route";

type GenerateCall = {
  messages: {
    content: {
      type: string;
      text?: string;
      data?: unknown;
      mediaType?: string;
    }[];
  }[];
};
const fetchedUrls = () =>
  mocks.fetchImage.mock.calls.map(([url]) => String(url));
const filesOf = (call: unknown) =>
  (call as GenerateCall).messages[0].content.filter(
    (part) => part.type === "file",
  );
const factsCalls = () =>
  mocks.generateText.mock.calls.filter(([call]) => filesOf(call).length > 0);
const isCategoryCall = (call: unknown) =>
  ((call as GenerateCall).messages[0].content[0].text ?? "").startsWith(
    "Elige la subcategoría",
  );
const synthesisCalls = () =>
  mocks.generateText.mock.calls.filter(
    ([call]) => filesOf(call).length === 0 && !isCategoryCall(call),
  );
const categoryCalls = () =>
  mocks.generateText.mock.calls.filter(([call]) => isCategoryCall(call));
const photoUrl = (name: string) =>
  `https://res.cloudinary.com/pdepapel/image/upload/v1/${name}.webp`;
const post = (body: unknown) =>
  POST(
    new Request("https://admin.example.com", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    {
      params: { storeId: "store-id" },
    },
  );
function factsFor(call: unknown) {
  const text = (call as GenerateCall).messages[0].content[0].text ?? "";
  const numbers = (
    text.match(/fotos de esta tanda son las número ([\d, ]+)/)?.[1] ?? ""
  )
    .split(",")
    .filter((value) => value.trim())
    .map((value) => Number(value.trim()));
  return numbers.map((photo) => ({
    photo,
    productType: "cuaderno",
    readableText: "",
    brandText: null,
    licence: null,
    designName: null,
    colorNames: [],
    showsSingleOption: false,
    quantity: null,
    quantityMixed: null,
    tip: null,
    measurements: null,
    material: null,
  }));
}

describe("product image analysis route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
    mocks.createOpenAI.mockReturnValue(vi.fn(() => "openai-model"));
    mocks.env.OPENAI_API_KEY = undefined;
    mocks.imageFindMany.mockResolvedValue([]);
    mocks.fetchImage.mockImplementation(
      async () =>
        new Response(new Uint8Array([9]), {
          headers: { "content-type": "image/webp" },
        }),
    );
    vi.stubGlobal("fetch", mocks.fetchImage);
    mocks.generateText.mockImplementation(async (call: unknown) =>
      filesOf(call).length > 0
        ? { output: { photos: factsFor(call) } }
        : isCategoryCall(call)
          ? { output: { categoryName: "Cuadernos" } }
          : synthesisResult,
    );
  });

  const synthesisResult = {
    output: {
      suggestedBaseName: "Cuaderno argollado A5",
      suggestedNameOptions: ["Cuaderno argollado A5"],
      suggestedDescription: "Cuaderno argollado con portada floral.",
      brand: "Norma",
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
      variantCandidates: [],
      catalogAttributes: [],
      observations: ["La portada muestra flores."],
      limitations: [],
      fieldEvidence: { name: { confidence: "alta", photos: [0] } },
    },
  };

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
        suggestedBaseName: "Cuaderno argollado A5 diseño Floral",
        brand: "Norma",
        categoryId: "category-notebooks",
        sizeId: "size-a5",
        colorId: "color-rosa",
        colorSource: "existing",
        designId: "design-floral",
        typeWarning: null,
      },
      analyzedWith: ["gemini"],
      remainingAnalysesToday: 19,
      reusedAnalysis: false,
    });
    expect(mocks.verifyStoreOwner).toHaveBeenCalledWith("owner-id", "store-id");
    expect(mocks.categoryFindMany.mock.calls[0]?.[0]).not.toHaveProperty(
      "take",
    );
    expect(mocks.sizeFindMany.mock.calls[0]?.[0]).not.toHaveProperty("take");
    expect(mocks.colorFindMany.mock.calls[0]?.[0]).not.toHaveProperty("take");
    expect(mocks.designFindMany.mock.calls[0]?.[0]).not.toHaveProperty("take");
    expect(factsCalls()).toHaveLength(1);
    expect(synthesisCalls()).toHaveLength(1);
    expect(categoryCalls()).toHaveLength(3);
    expect(categoryCalls()[0][0]).toMatchObject({
      temperature: 0,
      maxRetries: 0,
    });
    expect(mocks.redisIncr).toHaveBeenCalledTimes(1);
    expect(mocks.redisSet).toHaveBeenCalledTimes(1);
  });

  it("reuses an identical cached proposal without consuming another analysis", async () => {
    mocks.redisGet
      .mockResolvedValueOnce({
        photosRead: [0],
        skipped: [],
        output: {
          suggestedBaseName: "Cuaderno argollado A5",
          suggestedNameOptions: ["Cuaderno argollado A5"],
          suggestedDescription: "Cuaderno argollado con portada floral.",
          brand: "Norma",
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
          variantCandidates: [],
          catalogAttributes: [],
          observations: ["La portada muestra flores."],
          limitations: [],
        },
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

  it("gives the reserved analysis back when the model fails, and keeps it on a quota error", async () => {
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisIncr.mockResolvedValue(1);
    // Falla también el reintento de la tanda.
    mocks.generateText
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockRejectedValueOnce(new Error("socket hang up"));
    const request = () =>
      new Request("https://admin.example.com", {
        method: "POST",
        body: JSON.stringify({
          imageUrls: [
            "https://res.cloudinary.com/pdepapel/image/upload/v1/cuaderno.webp",
          ],
        }),
      });

    const failed = await POST(request(), { params: { storeId: "store-id" } });
    expect(failed.status).toBe(422);
    expect(mocks.redisDecr).toHaveBeenCalledWith(
      expect.stringContaining("store:store-id:product-image-analysis:"),
    );

    mocks.redisDecr.mockClear();
    mocks.generateText.mockRejectedValueOnce(
      new Error("RESOURCE_EXHAUSTED: quota"),
    );
    const quota = await POST(request(), { params: { storeId: "store-id" } });
    expect(quota.status).toBe(429);
    await expect(quota.json()).resolves.toEqual({
      error: "La IA está ocupada, intenta en un minuto.",
    });
    expect(mocks.redisDecr).toHaveBeenCalledTimes(1);
  });

  it("cuota diaria de Gemini agotada: «intenta más tarde» y el análisis se devuelve", async () => {
    mocks.generateText.mockRejectedValue(
      Object.assign(new Error("You exceeded your current quota"), {
        statusCode: 429,
        responseBody: JSON.stringify({
          error: {
            details: [
              {
                violations: [
                  {
                    quotaId:
                      "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
                  },
                ],
              },
            ],
          },
        }),
      }),
    );
    const response = await post({ imageUrls: [photoUrl("cuaderno")] });
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "La IA está ocupada, intenta más tarde.",
    });
    expect(mocks.redisSet).toHaveBeenCalledWith(
      "ai:gemini:skip",
      "daily-quota",
      {
        ex: expect.any(Number),
      },
    );
    expect(mocks.redisDecr).toHaveBeenCalledTimes(1);
  });

  it("OpenAI es el principal: responde y Gemini nunca se llama", async () => {
    mocks.env.OPENAI_API_KEY = "openai-test-key";
    const response = await post({ imageUrls: [photoUrl("cuaderno")] });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      analyzedWith: ["openai"],
      analysis: { categoryId: "category-notebooks", typeWarning: null },
    });
    expect(
      mocks.generateText.mock.calls.some(
        ([call]) => call.model === "gemini-model",
      ),
    ).toBe(false);
    const first = mocks.generateText.mock.calls[0][0];
    expect(first.model).toBe("openai-model");
    expect(first.providerOptions).toEqual({
      openai: {
        reasoningEffort: "none",
        store: false,
        strictJsonSchema: false,
      },
    });
  });

  it("OpenAI con error 5xx: responde Gemini y la respuesta lo dice", async () => {
    mocks.env.OPENAI_API_KEY = "openai-test-key";
    const answer = mocks.generateText.getMockImplementation()!;
    mocks.generateText.mockImplementation(async (call: { model: string }) => {
      if (call.model === "openai-model") {
        throw Object.assign(new Error("Internal error"), { statusCode: 503 });
      }
      return answer(call);
    });

    const response = await post({ imageUrls: [photoUrl("cuaderno")] });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      analyzedWith: ["gemini"],
      analysis: { categoryId: "category-notebooks" },
    });
  });

  it("si fallan OpenAI y Gemini: «La IA está ocupada, intenta más tarde.» y el análisis se devuelve", async () => {
    mocks.env.OPENAI_API_KEY = "openai-test-key";
    mocks.generateText.mockRejectedValue(
      Object.assign(new Error("Internal error"), { statusCode: 503 }),
    );
    const response = await post({ imageUrls: [photoUrl("cuaderno")] });
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "La IA está ocupada, intenta más tarde.",
    });
    expect(mocks.redisDecr).toHaveBeenCalledTimes(1);
  });

  it("sin clave de OpenAI (Preview) responde solo Gemini y un 5xx no cambia de proveedor", async () => {
    mocks.generateText.mockRejectedValue(
      Object.assign(new Error("Internal error"), { statusCode: 503 }),
    );
    const response = await post({ imageUrls: [photoUrl("cuaderno")] });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.createOpenAI).not.toHaveBeenCalled();
  });

  it("lee todas las fotos: 7 fotos van en dos tandas (4 + 3) y una pasada final sin imágenes", async () => {
    const urls = Array.from({ length: 7 }, (_, index) =>
      photoUrl(`foto-${index}`),
    );
    const response = await post({ imageUrls: urls, categoryName: "Cuadernos" });

    expect(response.status).toBe(200);
    expect(factsCalls().map(([call]) => filesOf(call).length)).toEqual([4, 3]);
    expect(fetchedUrls()).toHaveLength(7);
    expect(fetchedUrls()[0]).toContain("/f_auto,q_auto,c_limit,w_1080/");
    expect(mocks.fetchImage.mock.calls[0][1]).toMatchObject({
      headers: { Accept: expect.stringContaining("image/webp") },
    });
    expect(filesOf(factsCalls()[0][0])[0]).toMatchObject({
      data: new Uint8Array([9]),
      mediaType: "image/webp",
    });
    expect(synthesisCalls()).toHaveLength(1);
    expect(mocks.redisIncr).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      photosRead: [0, 1, 2, 3, 4, 5, 6],
      photoCount: 7,
      skipped: [],
    });
  });

  it("salta las fotos marcadas como rotas, avisa y numera la evidencia como la pantalla", async () => {
    mocks.imageFindMany.mockResolvedValue([{ url: photoUrl("rota") }]);
    mocks.generateText.mockImplementation(async (call: unknown) =>
      filesOf(call).length > 0
        ? { output: { photos: factsFor(call) } }
        : {
            output: {
              ...synthesisResult.output,
              fieldEvidence: { name: { confidence: "alta", photos: [1] } },
            },
          },
    );

    const response = await post({
      imageUrls: [photoUrl("portada"), photoUrl("rota"), photoUrl("detalle")],
    });

    expect(response.status).toBe(200);
    expect(fetchedUrls()).toEqual([
      expect.stringContaining("portada"),
      expect.stringContaining("detalle"),
    ]);
    expect(filesOf(factsCalls()[0][0])).toHaveLength(2);
    expect(mocks.imageFindMany.mock.calls[0][0]).toMatchObject({
      where: { url: { in: expect.any(Array) }, brokenAt: { not: null } },
    });
    await expect(response.json()).resolves.toMatchObject({
      photosRead: [0, 2],
      skipped: [{ photo: 1, reason: "Imagen rota" }],
      analysis: {
        fieldEvidence: { name: { confidence: "alta", photos: [2] } },
      },
    });
  });

  it("si todas las fotos están rotas no llama al modelo ni gasta un análisis", async () => {
    mocks.imageFindMany.mockResolvedValue([{ url: photoUrl("rota") }]);
    const response = await post({ imageUrls: [photoUrl("rota")] });

    expect(response.status).toBe(422);
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.redisIncr).not.toHaveBeenCalled();
  });

  it("la caché depende de cada foto y de su orden", async () => {
    await post({ imageUrls: [photoUrl("a"), photoUrl("b")] });
    await post({ imageUrls: [photoUrl("b"), photoUrl("a")] });
    await post({ imageUrls: [photoUrl("a"), photoUrl("c")] });
    const keys = mocks.redisSet.mock.calls.map(([key]) => key);
    expect(new Set(keys).size).toBe(3);
  });

  it("la función tiene 60 s", () => {
    expect(maxDuration).toBe(60);
  });
});
