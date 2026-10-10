import { describe, expect, it, vi } from "vitest";

import {
  PIPELINE_BUDGET_MS,
  PIPELINE_TIMEOUTS,
  analyzeProductImages,
  ANALYSIS_IMAGE_ACCEPT,
  buildPhotoFactsPrompt,
  enrichShortName,
  fetchAnalysisImage,
  NO_LISTED_CATEGORY,
  reconcileNameCounts,
  buildSynthesisPrompt,
  type AnalysisGenerate,
} from "@/lib/product-image-analysis-pipeline";

const lists = {
  categories: ["Marcadores (Escritura)", "Bolígrafos / Lapiceros (Escritura)"],
  sizes: ["A5"],
  colors: ["Rosa", "Azul"],
  designs: ["Gatito"],
};
const urls = (count: number) =>
  Array.from(
    { length: count },
    (_, index) =>
      `https://res.cloudinary.com/demo/image/upload/v1/foto-${index}.jpg`,
  );

const synthesisOutput = {
  suggestedBaseName: "Set de marcadores Gipao punta pincel 12 colores",
  suggestedNameOptions: [],
  suggestedDescription: null,
  brand: "Gipao",
  categoryName: "Marcadores",
  categoryIsDeterministic: true,
  sizeName: null,
  sizeIsDeterministic: false,
  colorName: null,
  colorHex: null,
  colorIsDeterministic: false,
  designName: null,
  designIsDeterministic: false,
  gtin: null,
  mpn: null,
  variantRecommendation: {
    shouldCreateVariants: false,
    axes: [],
    evidence: null,
  },
  variantCandidates: [],
  catalogAttributes: [],
  observations: [],
  limitations: [],
};

function fakeGenerate(
  overrides: Partial<
    Record<
      "facts" | "synthesis" | "category",
      (request: Parameters<AnalysisGenerate>[0]) => Promise<unknown>
    >
  > = {},
) {
  return vi.fn<AnalysisGenerate>(async (request) => {
    const custom = overrides[request.kind];
    if (custom) return (await custom(request)) as never;
    if (request.kind === "facts") {
      return {
        output: {
          photos: request.photoNumbers.map((photo) => ({
            photo,
            productType: "marcador",
            readableText: "GIPAO 12",
            brandText: "GIPAO",
            licence: null,
            designName: null,
            colorNames: [],
            showsSingleOption: false,
            quantity: 12,
            quantityMixed: "colores",
            tip: "pincel",
            measurements: null,
            material: null,
            inkBase: null,
            sheetCount: null,
          })),
        },
        usage: { inputTokens: 1000, outputTokens: 100 },
      } as never;
    }
    if (request.kind === "category") {
      return {
        output: { categoryName: synthesisOutput.categoryName },
        usage: { inputTokens: 500, outputTokens: 10 },
      } as never;
    }
    return {
      output: synthesisOutput,
      usage: { inputTokens: 2000, outputTokens: 300 },
    } as never;
  });
}

describe("análisis de todas las fotos", () => {
  it("7 fotos: dos tandas en paralelo (4 + 3) y una pasada final sin imágenes", async () => {
    const generate = fakeGenerate();
    const result = await analyzeProductImages({
      imageUrls: urls(7),
      lists,
      generate,
    });

    const facts = generate.mock.calls
      .filter(([request]) => request.kind === "facts")
      .map(([request]) => request);
    expect(facts.map((request) => request.imageUrls.length)).toEqual([4, 3]);
    expect(facts.map((request) => request.photoNumbers)).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6],
    ]);
    const synthesis = generate.mock.calls.filter(
      ([request]) => request.kind === "synthesis",
    );
    expect(synthesis).toHaveLength(1);
    expect(synthesis[0][0].imageUrls).toEqual([]);
    expect(synthesis[0][0].prompt).toContain('"photo": 6');
    expect(result.photosRead).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(result.skipped).toEqual([]);
    expect(result.usage).toEqual({
      inputTokens: 5500,
      outputTokens: 530,
      calls: 6,
    });
  });

  it("las fotos van con la copia de 1080 del panel, no el original", async () => {
    const generate = fakeGenerate();
    await analyzeProductImages({ imageUrls: urls(1), lists, generate });
    expect(generate.mock.calls[0][0].imageUrls[0]).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_1080/v1/foto-0.jpg",
    );
  });

  it("una tanda que falla o tarda demasiado no tumba el análisis: sus fotos quedan como no leídas", async () => {
    const generate = fakeGenerate({
      facts: async (request) => {
        if (request.photoNumbers[0] === 4)
          throw new Error("Failed to download");
        return {
          output: {
            photos: request.photoNumbers.map((photo) => ({
              photo,
              productType: null,
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
            })),
          },
        };
      },
    });
    const result = await analyzeProductImages({
      imageUrls: urls(6),
      lists,
      generate,
    });
    expect(result.photosRead).toEqual([0, 1, 2, 3]);
    expect(result.skipped).toEqual([
      { photo: 4, reason: "No se pudo leer" },
      { photo: 5, reason: "No se pudo leer" },
    ]);

    const slow = fakeGenerate({
      facts: (request) =>
        new Promise((_resolve, reject) =>
          request.abortSignal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    });
    const timedOut = analyzeProductImages({
      imageUrls: urls(2),
      lists,
      generate: slow,
      timeouts: { batchMs: 20, synthesisMs: 20 },
    });
    await expect(timedOut).rejects.toThrow("No se pudo leer ninguna foto");
  });

  it("una etiqueta larga o una cantidad 0 no tumban la tanda: se recortan", async () => {
    const generate = fakeGenerate({
      facts: async (request) => ({
        output: {
          photos: request.photoNumbers.map((photo) => ({
            photo,
            productType: "marcador ".repeat(30),
            readableText: "TEXTO ".repeat(200),
            brandText: null,
            licence: null,
            designName: null,
            colorNames: [
              "Rosa",
              "Azul",
              "Verde",
              "Lila",
              "Negro",
              "Blanco",
              "Gris",
              "Café",
              "Rojo",
            ],
            showsSingleOption: false,
            quantity: 0,
            quantityMixed: null,
            tip: null,
            measurements: null,
            material: null,
          })),
        },
      }),
    });
    const result = await analyzeProductImages({
      imageUrls: urls(2),
      lists,
      generate,
    });
    expect(result.photosRead).toEqual([0, 1]);
    const synthesisPrompt = generate.mock.calls.find(
      ([request]) => request.kind === "synthesis",
    )![0].prompt;
    const facts = JSON.parse(
      synthesisPrompt.split("LO QUE SE LEYÓ EN LAS FOTOS:")[1],
    );
    expect(facts[0].readableText.length).toBeLessThanOrEqual(400);
    expect(facts[0].productType.length).toBeLessThanOrEqual(80);
    expect(facts[0].colorNames).toHaveLength(6);
    expect(facts[0].quantity).toBeNull();
  });

  it("si la pasada final no cumple el formato, la repite una vez", async () => {
    let attempts = 0;
    const generate = fakeGenerate({
      synthesis: async () => {
        attempts += 1;
        if (attempts === 1)
          throw new Error(
            "No object generated: response did not match schema.",
          );
        return { output: synthesisOutput };
      },
    });
    const result = await analyzeProductImages({
      imageUrls: urls(1),
      lists,
      generate,
    });
    expect(attempts).toBe(2);
    expect(result.output.brand).toBe("Gipao");
  });
});

describe("tiempos dentro de los 60 s de la función", () => {
  it("30 s por tanda, hasta 20 s para la pasada final y todo dentro de 55 s; la subcategoría usa lo que quede", () => {
    expect(PIPELINE_TIMEOUTS).toEqual({ categoryMs: 8_000, batchMs: 30_000, synthesisMs: 20_000, downloadMs: 10_000 });
    expect(PIPELINE_BUDGET_MS).toBe(55_000);
  });

  it("la pasada final nunca se pasa del presupuesto que queda", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    let synthesisSignal: AbortSignal | undefined;
    const generate = fakeGenerate({
      facts: async (request) => {
        now = 45_000;
        return fakeGenerate()(request);
      },
      synthesis: async (request) => {
        synthesisSignal = request.abortSignal;
        return { output: synthesisOutput };
      },
    });
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await analyzeProductImages({ imageUrls: urls(2), lists, generate });
    const synthesisTimeout = timeout.mock.calls.map(([ms]) => ms).find((ms) => ms <= 10_000 && ms > 3_000);
    vi.restoreAllMocks();
    expect(synthesisSignal).toBeDefined();
    expect(synthesisTimeout).toBe(10_000);
  });

  it("una tanda que falla se reintenta una vez si queda tiempo, y queda registrada", async () => {
    let calls = 0;
    const generate = fakeGenerate({
      facts: async (request) => {
        calls += 1;
        if (calls === 1) throw new Error("temporarily unavailable");
        return { output: { photos: request.photoNumbers.map((photo) => ({ photo, productType: "x", readableText: "", brandText: null, licence: null, designName: null, colorNames: [], showsSingleOption: false, quantity: null, quantityMixed: null, tip: null, measurements: null, material: null })) } };
      },
    });
    const result = await analyzeProductImages({ imageUrls: urls(2), lists, generate });
    expect(calls).toBe(2);
    expect(result.photosRead).toEqual([0, 1]);
    expect(result.timings.filter((t) => t.kind === "facts")).toEqual([
      expect.objectContaining({ photos: [0, 1], attempt: 1, ok: false }),
      expect.objectContaining({ photos: [0, 1], attempt: 2, ok: true }),
    ]);
    expect(result.timings.filter((timing) => timing.kind === "synthesis").at(-1)).toEqual(expect.objectContaining({ kind: "synthesis", ok: true }));
  });

  it("si la tanda se comió el tiempo, no se reintenta: la pasada final necesita el suyo", async () => {
    const slow = fakeGenerate({
      facts: (request) => new Promise((_resolve, reject) => request.abortSignal.addEventListener("abort", () => reject(new Error("aborted")))),
    });
    await expect(
      analyzeProductImages({ imageUrls: urls(1), lists, generate: slow, timeouts: { batchMs: 60, synthesisMs: 40 }, budgetMs: 100 }),
    ).rejects.toThrow("No se pudo leer ninguna foto");
    expect(slow.mock.calls.filter(([request]) => request.kind === "facts")).toHaveLength(1);
  });
});

describe("descarga de las fotos", () => {
  it("pide la foto como un navegador para reutilizar la copia WebP que ya existe", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/webp" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const image = await fetchAnalysisImage(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_1080/v1/a.jpg",
      AbortSignal.timeout(1000),
    );
    expect(image).toEqual({
      data: new Uint8Array([1, 2, 3]),
      mediaType: "image/webp",
    });
    expect((fetchMock.mock.calls[0] as unknown[])[1]).toMatchObject({
      headers: { Accept: ANALYSIS_IMAGE_ACCEPT },
    });
    expect(ANALYSIS_IMAGE_ACCEPT).toContain("image/webp");
    vi.unstubAllGlobals();
  });

  it("una foto que no se descarga se salta con aviso y las demás se leen", async () => {
    const generate = fakeGenerate();
    const fetchImage = vi.fn(async (url: string) => {
      if (url.includes("foto-1")) throw new Error("HTTP 404");
      return { data: new Uint8Array([7]), mediaType: "image/webp" };
    });
    const result = await analyzeProductImages({
      imageUrls: urls(3),
      lists,
      generate,
      fetchImage,
    });

    const facts = generate.mock.calls
      .filter(([request]) => request.kind === "facts")
      .map(([request]) => request);
    expect(facts.map((request) => request.photoNumbers)).toEqual([[0, 2]]);
    expect(facts[0].images).toEqual([
      { data: new Uint8Array([7]), mediaType: "image/webp" },
      { data: new Uint8Array([7]), mediaType: "image/webp" },
    ]);
    expect(fetchImage.mock.calls[0][0]).toContain(
      "/f_auto,q_auto,c_limit,w_1080/",
    );
    expect(result.photosRead).toEqual([0, 2]);
    expect(result.skipped).toEqual([
      { photo: 1, reason: "No se pudo descargar" },
    ]);
  });
});

describe("instrucciones", () => {
  it("cada tanda numera sus fotos y pide solo lo que se ve", () => {
    const prompt = buildPhotoFactsPrompt({ photoNumbers: [4, 5], lists });
    expect(prompt).toContain("4, 5");
    expect(prompt).toContain("Rosa, Azul");
    expect(prompt).toContain("Nunca adivines");
  });

  it("la pasada final trae la gramática, el estilo, las reglas de marca y la pista de subcategoría", () => {
    const prompt = buildSynthesisPrompt({
      facts: [],
      lists,
      categoryName: "Marcadores",
    });
    expect(prompt).toContain("máximo 60 caracteres");
    expect(prompt).toContain(
      "Set de marcadores acrílicos Gipao punta pincel 12 colores",
    );
    expect(prompt).toContain("N colores");
    expect(prompt).toContain("Una licencia");
    expect(prompt).toContain(
      "Subcategoría elegida por la administradora: Marcadores",
    );
    expect(prompt).toContain("Subcategorías disponibles (categoryName copia uno de estos nombres tal cual, sin el tipo entre paréntesis): Marcadores (Escritura); Bolígrafos / Lapiceros (Escritura)");
    expect(prompt).toContain("Sustantivo con que empieza el NOMBRE según la subcategoría (no es la subcategoría): Marcadores → Marcador; Bolígrafos / Lapiceros → Lapicero");
    expect(prompt).not.toMatch(/\(Escritura\) →/);
    expect(prompt).toContain("lindo");
    expect(prompt).toContain("Nunca sugieras SKU, precios, costos");
  });
});

describe("cantidades del nombre: solo con evidencia", () => {
  const fact = (overrides: Record<string, unknown> = {}) => ({
    photo: 0, productType: null, readableText: "", brandText: null, licence: null, designName: null, colorNames: [], showsSingleOption: false,
    quantity: null, quantityMixed: null, tip: null, measurements: null, material: null, inkBase: null, sheetCount: null, ...overrides,
  }) as never;

  it("Scribe: el nombre actual dice 24 colores, nunca 30", () => {
    expect(reconcileNameCounts("Set de marcadores Scribe 30 colores", { facts: [], currentName: "Set de plumones SCRIBE punta delgada 24 colores más sello doble punta" })).toBe("Set de marcadores Scribe 24 colores");
  });

  it("Offi-Esco: 10 colores distintos es «10 colores», no x10", () => {
    expect(reconcileNameCounts("Libreta William Morris x3 diseños", { facts: [], currentName: "Libretas William Morris 3 diseños" })).toBe("Libreta William Morris 3 diseños");
    expect(reconcileNameCounts("Libreta William Morris x 3 colores", { facts: [], currentName: null })).toBe("Libreta William Morris");
    expect(reconcileNameCounts("Set de lapiceros semi gel Offi-Esco aroma x10", { facts: [], currentName: "Set de lapiceros semi gel Offi-Esco 10 colores con aroma" })).toBe("Set de lapiceros semi gel Offi-Esco aroma 10 colores");
  });

  it("Norma: «1 materia» sin respaldo se corrige con el dato del producto (5 materias)", () => {
    expect(reconcileNameCounts("Cuaderno argollado Norma Let's Fly Away 1 materia", { facts: [], currentName: "Cuaderno Argollado NORMA 5 Materias Grande" })).toBe("Cuaderno argollado Norma Let's Fly Away 5 materias");
  });

  it("sin evidencia la cantidad se quita en vez de adivinarla", () => {
    expect(reconcileNameCounts("Set de washi tape tonos pastel x10", { facts: [fact()], currentName: "" })).toBe("Set de washi tape tonos pastel");
    expect(reconcileNameCounts("Cuaderno cosido con 3 materias", { facts: [fact()], currentName: null })).toBe("Cuaderno cosido");
  });

  it("lo que las fotos leyeron cuenta: colores distintos «N colores», iguales «xN»", () => {
    expect(reconcileNameCounts("Set de marcadores Gipao x12", { facts: [fact({ quantity: 12, quantityMixed: "colores" })] })).toBe("Set de marcadores Gipao 12 colores");
    expect(reconcileNameCounts("Clips mariposa 12 colores", { facts: [fact({ quantity: 12, quantityMixed: null })] })).toBe("Clips mariposa x12");
    expect(reconcileNameCounts("Block de notas 50 hojas", { facts: [fact({ readableText: "BLOCK 80 HOJAS RAYADAS" })] })).toBe("Block de notas 80 hojas");
  });

  it("si las fotos no coinciden en la cantidad, no se pone ninguna", () => {
    expect(reconcileNameCounts("Set de marcadores Gipao 12 colores", { facts: [fact({ quantity: 12 }), fact({ photo: 1, quantity: 24 })] })).toBe("Set de marcadores Gipao");
  });
});

describe("la propuesta usa la cantidad con respaldo", () => {
  it("corrige nombre, opciones y la cantidad del catálogo con el dato del producto", async () => {
    const generate = fakeGenerate({
      synthesis: async () => ({
        output: { ...synthesisOutput, suggestedBaseName: "Set de marcadores Scribe 30 colores", suggestedNameOptions: ["Set de plumones Scribe x30"], quantity: { value: 30, mixed: "colores" } },
      }),
    });
    const result = await analyzeProductImages({ imageUrls: urls(1), lists, generate, currentName: "Set de plumones SCRIBE punta delgada 24 colores" });
    // Las fotos de prueba leen punta pincel: el nombre corto la suma.
    expect(result.output.suggestedBaseName).toBe("Set de marcadores punta pincel Scribe 24 colores");
    expect(result.output.suggestedNameOptions).toEqual(["Set de plumones punta pincel Scribe 24 colores"]);
    expect(result.output.quantity).toEqual({ value: 24, mixed: "colores" });
  });
});

describe("nombres cortos: solo descriptores que se leyeron", () => {
  const fact = (overrides: Record<string, unknown> = {}) => ({
    photo: 0, productType: null, readableText: "", brandText: null, licence: null, designName: null, colorNames: [], showsSingleOption: false,
    quantity: null, quantityMixed: null, tip: null, measurements: null, material: null, inkBase: null, sheetCount: null, ...overrides,
  }) as never;

  it("agrega material y punta tras el sustantivo, diseño y medida antes de la cantidad, hasta 50–60", () => {
    const name = enrichShortName("Set de marcadores Aihai 12 colores", {
      facts: [fact({ material: "Plástico", tip: "pincel", measurements: "14cm" }), fact({ photo: 1, tip: "pincel" })],
      designName: null,
    });
    expect(name).toBe("Set de marcadores de plástico punta pincel Aihai 12 colores");
    expect(name.length).toBeGreaterThanOrEqual(50);
    expect(name.length).toBeLessThanOrEqual(60);
  });

  it("el diseño entra antes de la cantidad y nada se repite", () => {
    expect(enrichShortName("Stickers Hello Kitty", { facts: [fact({ material: "papel", measurements: "10 x 15cm" })], designName: "Hello Kitty" })).toBe(
      "Stickers de papel Hello Kitty 10 x 15 cm",
    );
  });

  it("una sigla de material (PP, PVC) no se vuelve descriptor ni se escribe «pP»", () => {
    expect(enrichShortName("Set de plumones Scribe punta delgada 24 colores", { facts: [fact({ material: "PP" })], designName: null })).toBe(
      "Set de plumones Scribe punta delgada 24 colores",
    );
    expect(enrichShortName("Cartuchera Kawaii", { facts: [fact({ material: "PVC transparente" })], designName: null })).toBe(
      "Cartuchera de PVC transparente Kawaii",
    );
  });

  it("con un empaque de «N diseños» no se agrega un solo «diseño X»", () => {
    expect(enrichShortName("Libreta William Morris 3 diseños", { facts: [fact()], designName: "Flores" })).toBe(
      "Libreta William Morris 3 diseños",
    );
  });

  it("«punta» solo para útiles de escritura; las medidas van con espacio y en minúscula", () => {
    expect(enrichShortName("Set de notas adhesivas marfil", { facts: [fact({ tip: "0.5mm", measurements: "5 MM" })], designName: null })).toBe(
      "Set de notas adhesivas marfil 5 mm",
    );
    expect(enrichShortName("Lapicero de gel Offi-Esco", { facts: [fact({ tip: "0.5mm" })], designName: null })).toBe("Lapicero de gel punta 0.5 mm Offi-Esco");
  });

  it("si el sustantivo no es canónico no parte la frase con un material", () => {
    expect(enrichShortName("Perforadora de papel Kamei x8", { facts: [fact({ material: "plástico" })], designName: null })).toBe(
      "Perforadora de papel Kamei x8",
    );
  });

  it("el material no se mete dentro de «diseño X»", () => {
    expect(enrichShortName("Set de notas adhesivas diseño Stitch", { facts: [fact({ material: "papel" })], designName: null })).toBe(
      "Set de notas adhesivas de papel diseño Stitch",
    );
  });

  it("sin hechos que agregar, el nombre corto queda igual", () => {
    expect(enrichShortName("Kit de lectura Morfil", { facts: [fact()], designName: null })).toBe("Kit de lectura Morfil");
  });

  it("un nombre de 50 o más no se toca, y nunca pasa de 60", () => {
    const long = "Set de lapiceros semi gel Offi-Esco con aroma 10 colores";
    expect(enrichShortName(long, { facts: [fact({ material: "plástico" })], designName: null })).toBe(long);
    const result = enrichShortName("Cuaderno argollado Norma diseño Animados", { facts: [fact({ material: "cartón duro reforzado", measurements: "21,5 x 28 cm" })], designName: "Animados" });
    expect(result.length).toBeLessThanOrEqual(60);
  });
});

describe("lectura de fotos tolerante", () => {
  it("una foto sin texto legible (readableText null) no tumba la tanda", async () => {
    const generate = fakeGenerate({
      facts: async (request) => ({
        output: {
          photos: request.photoNumbers.map((photo) => ({
            photo, productType: "cuaderno", readableText: null, brandText: null, licence: null, designName: null,
            colorNames: [], showsSingleOption: true, quantity: null, quantityMixed: null, tip: null, measurements: null, material: null,
          })),
        },
      }),
    });
    const result = await analyzeProductImages({ imageUrls: urls(2), lists, generate });
    expect(result.photosRead).toEqual([0, 1]);
  });
});

describe("subcategoría en un paso propio", () => {
  const run = (generate: AnalysisGenerate) =>
    analyzeProductImages({ imageUrls: urls(2), lists, generate });

  it("elige entre las subcategorías existentes, con opciones cerradas y sin fotos", async () => {
    const generate = fakeGenerate({
      category: async () => ({ output: { categoryName: "Bolígrafos / Lapiceros" } }),
    });
    const result = await run(generate);
    const call = generate.mock.calls.find(([request]) => request.kind === "category")![0];
    expect(call.imageUrls).toEqual([]);
    expect(call.images).toBeUndefined();
    expect(call.schema.safeParse({ categoryName: "Bolígrafos / Lapiceros" }).success).toBe(true);
    expect(call.schema.safeParse({ categoryName: "Lámparas" }).success).toBe(false);
    expect(result.output.categoryName).toBe("Bolígrafos / Lapiceros");
    expect(result.output.categoryIsDeterministic).toBe(true);
  });

  const votes = (answers: string[]) => {
    let call = 0;
    return fakeGenerate({
      category: async () => ({ output: { categoryName: answers[call++ % answers.length] } }),
    });
  };

  it("pregunta tres veces en paralelo y gana la mayoría (3 de 3)", async () => {
    const generate = votes(["Bolígrafos / Lapiceros", "Bolígrafos / Lapiceros", "Bolígrafos / Lapiceros"]);
    const result = await run(generate);
    expect(generate.mock.calls.filter(([request]) => request.kind === "category")).toHaveLength(3);
    expect(result.output.categoryName).toBe("Bolígrafos / Lapiceros");
  });

  it("2 contra 1: gana la que tiene dos votos", async () => {
    const result = await run(votes(["Marcadores", "Bolígrafos / Lapiceros", "Bolígrafos / Lapiceros"]));
    expect(result.output.categoryName).toBe("Bolígrafos / Lapiceros");
  });

  it("1, 1 y 1: desempata la subcategoría del sustantivo del nombre propuesto", async () => {
    const result = await run(votes(["Bolígrafos / Lapiceros", NO_LISTED_CATEGORY, "Marcadores"]));
    // El nombre propuesto es «Set de marcadores …»: su sustantivo es de Marcadores.
    expect(result.output.categoryName).toBe("Marcadores");
  });

  it("1, 1 y 1 sin sustantivo reconocible: desempata la subcategoría actual, y si no, «Ninguna»", async () => {
    const synthesis = async () => ({ output: { ...synthesisOutput, suggestedBaseName: "Estuche Gipao", suggestedNameOptions: [], categoryName: null, categoryIsDeterministic: false } });
    let call = 0;
    const answers = ["Bolígrafos / Lapiceros", NO_LISTED_CATEGORY, "Marcadores"];
    const tie = () => fakeGenerate({ synthesis, category: async () => ({ output: { categoryName: answers[call++ % 3] } }) });
    const withCurrent = await analyzeProductImages({ imageUrls: urls(2), lists, generate: tie(), categoryName: "Marcadores" });
    expect(withCurrent.output.categoryName).toBe("Marcadores");
    const withoutCurrent = await analyzeProductImages({ imageUrls: urls(2), lists, generate: tie() });
    expect(withoutCurrent.output.categoryName).toBeNull();
  });

  it("«Ninguna de la lista» deja la propuesta nueva de la pasada final", async () => {
    const result = await run(
      fakeGenerate({
        category: async () => ({ output: { categoryName: NO_LISTED_CATEGORY } }),
        synthesis: async () => ({ output: { ...synthesisOutput, categoryName: "Globos", categoryIsDeterministic: true } }),
      }),
    );
    expect(result.output.categoryName).toBe("Globos");
  });

  it("sin tiempo de sobra se salta el paso de subcategoría", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const slowSynthesis = fakeGenerate({
      synthesis: async () => {
        now = 53_000;
        return { output: synthesisOutput };
      },
    });
    await analyzeProductImages({ imageUrls: urls(2), lists, generate: slowSynthesis });
    vi.restoreAllMocks();
    expect(slowSynthesis.mock.calls.some(([request]) => request.kind === "category")).toBe(false);
  });

  it("si el paso de subcategoría falla, el análisis sigue con la de la pasada final", async () => {
    const result = await run(
      fakeGenerate({ category: async () => { throw new Error("boom"); } }),
    );
    expect(result.output.categoryName).toBe("Marcadores");
    expect(result.timings.at(-1)).toEqual(expect.objectContaining({ kind: "category", ok: false }));
  });
});

describe("tinta, hojas y medidas leídas", () => {
  const fact = (overrides: Record<string, unknown> = {}) => ({
    photo: 0, productType: null, readableText: "", brandText: null, licence: null, designName: null, colorNames: [], showsSingleOption: false,
    quantity: null, quantityMixed: null, tip: null, measurements: null, material: null, inkBase: null, sheetCount: null, ...overrides,
  }) as never;

  it("la base de la tinta va tras la punta y las hojas antes de la cantidad", () => {
    expect(enrichShortName("Set de marcadores Aihai 12 colores", { facts: [fact({ inkBase: "agua" })], designName: null })).toBe(
      "Set de marcadores base agua Aihai 12 colores",
    );
    expect(enrichShortName("Libreta William Morris", { facts: [fact({ sheetCount: 80 })], designName: null })).toBe(
      "Libreta William Morris 80 hojas",
    );
  });

  it("«14cm», «14 cm» y «14 cm aprox.» son la misma medida al votar", () => {
    expect(
      enrichShortName("Cartuchera Kawaii", {
        facts: [fact({ measurements: "20 cm" }), fact({ photo: 1, measurements: "14cm" }), fact({ photo: 2, measurements: "14 cm aprox." })],
        designName: null,
      }),
    ).toBe("Cartuchera Kawaii 14 cm");
  });
});
