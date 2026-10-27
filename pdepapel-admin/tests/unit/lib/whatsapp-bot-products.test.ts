import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  typeFindMany: vi.fn(async () => [] as { name: string }[]),
  categoryFindMany: vi.fn(async () => [] as { name: string; slug: string }[]),
  generateText: vi.fn(),
  createGoogle: vi.fn(() => () => "gemini-model"),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    product: {
      findMany: mocks.findMany,
      count: mocks.count,
      findFirst: mocks.findFirst,
      fields: { reservedUnits: "campo:reservedUnits" },
    },
    type: { findMany: mocks.typeFindMany },
    category: { findMany: mocks.categoryFindMany },
  },
}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: mocks.createGoogle,
}));
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => () => "openai-model",
}));
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => {
      throw new Error("sin Redis en pruebas");
    },
  },
}));
// Las ofertas se prueban contra la base en tests/integration/whatsapp-promo-prices.test.ts.
vi.mock("@/lib/product-pricing", () => ({ priceLines: vi.fn(async () => new Map()) }));
vi.mock("@/lib/env.mjs", () => ({
  env: { GEMINI_API_KEY: "clave-de-prueba", OPENAI_API_KEY: "clave-de-prueba" },
}));

import {
  MIN_USEFUL_DESCRIPTION_LENGTH,
  PHOTO_WIDTH,
  PRODUCT_TEMPLATES,
  PRODUCT_CLASSIFIER_SLOW_NOTICE_MS,
  PRODUCT_CLASSIFIER_TIMEOUT_MS,
  PRODUCT_MATCH_LIMIT,
  PRODUCT_TEMPLATES_VERSION,
  answerProductQuestion,
  answerProductQuestionDetailed,
  intentWithoutModel,
  looksLikeProductQuestionForStore,
  renderCheapSearch,
  renderCeilingMiss,
  renderNoResults,
  buildCheapListBody,
  areProductAnswersApproved,
  buildSearchQuery,
  fallbackQueryFromMessage,
  productClassificationSchema,
  classifyProductQuestion,
  looksLikeProductQuestion,
  previewProductTemplates,
  cleanDescription,
  pickPhoto,
  renderAvailability,
  renderProductPhoto,
  renderProductFeatures,
  renderProductPrice,
  renderProductSearch,
  renderPartialSearch,
  buildPartialListBody,
  tipoSolo,
  resolveAvailability,
  resolveProductFeatures,
  resolveProductPrice,
  answerAboutProduct,
  resolveProductSearch,
  trimForWhatsApp,
} from "@/lib/whatsapp/bot-products";
import { STATIC_TERM_INDEX, parseSearchIntent, resetCatalogTermCache } from "@/lib/whatsapp/search-intent";
import {
  productNameTokenSearchWhere,
  productTokenSearchWhere,
  searchTokens,
} from "@/lib/search-terms";

const clasificacion = {
  intent: "product.search" as const,
  productType: "cuaderno",
  character: "Stitch",
  descriptor: null,
};

describe("búsqueda palabra por palabra", () => {
  it("parte la consulta y descarta las palabras de unión", () => {
    expect(searchTokens("cuaderno de Stitch")).toEqual(["cuaderno", "stitch"]);
    expect(searchTokens("agenda de Hello Kitty")).toEqual([
      "agenda",
      "hello",
      "kitty",
    ]);
    // «de» y las palabras de dos letras se caen: aparecen dentro de todo.
    expect(searchTokens("algo de la")).toEqual([]);
  });

  it("exige TODAS las palabras, cada una con sus sinónimos", () => {
    const where = productTokenSearchWhere("cuaderno de Stitch");
    expect(where).toHaveLength(2);
    // Primera palabra: cuaderno y sus sinónimos, o en la descripción.
    const nombres = where[0]
      .OR!.map((c: any) => c.name?.contains)
      .filter(Boolean);
    expect(nombres).toContain("cuaderno");
    expect(nombres).toContain("libreta");
    expect(where[0].OR).toContainEqual({
      description: { contains: "cuaderno" },
    });
    // Segunda palabra: el personaje.
    expect(where[1].OR).toContainEqual({ description: { contains: "stitch" } });
  });

  it("una consulta sin palabras útiles no produce condiciones", () => {
    expect(productTokenSearchWhere("de la")).toEqual([]);
    expect(productTokenSearchWhere("")).toEqual([]);
  });

  it("las consultas que antes daban cero ahora sí se pueden armar", () => {
    // Las mismas diez de la investigación: con la búsqueda de frase entera
    // todas daban 0 porque ningún nombre contiene la frase literal.
    for (const q of [
      "cuaderno de Stitch",
      "agenda de Hello Kitty",
      "lapicero de Kuromi",
      "cartuchera de Capibara",
      "sticker de Snoopy",
      "llavero de Stitch",
      "cuaderno de Harry Potter",
      "mug de Hello Kitty",
      "borrador de Kuromi",
      "termo de Capibara",
    ]) {
      expect(productTokenSearchWhere(q).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("el portero que ahorra cuota", () => {
  it("deja pasar lo que suena a pregunta de producto", () => {
    for (const q of [
      "¿tienen algo de Kuromi?",
      "queda cartuchera de capibara?",
      "busco un cuaderno",
      "manejan stickers?",
      "hay agendas disponibles?",
    ]) {
      expect(looksLikeProductQuestion(q)).toBe(true);
    }
  });

  it("no gasta una llamada en un saludo", () => {
    expect(looksLikeProductQuestion("gracias!!")).toBe(false);
    expect(looksLikeProductQuestion("hola buenas")).toBe(false);
  });

  it("la señal tiene que empezar y terminar en palabra entera", () => {
    expect(looksLikeProductQuestion("se mantienen abiertos el domingo?")).toBe(false);
    expect(looksLikeProductQuestion("chay de todo")).toBe(false);
    expect(looksLikeProductQuestion("¿se mantienen? ¿tienen colores pastel?")).toBe(true);
  });

  // El portero conocía «ver el» y «ver la» pero no el plural, así que
  // «¿puedo ver los acrílicos?» —de una conversación real— no llegaba ni al
  // clasificador: se caía aquí, antes de empezar.
  it.each([
    "puedo ver los acrílicos?",
    "me dejas ver la caja?",
    "¿me dejas ver los acrílicos?",
    "déjame ver las carpetas",
    "quisiera ver los separadores",
  ])("deja pasar «%s»", (q) => {
    expect(looksLikeProductQuestion(q)).toBe(true);
  });
});

describe("resolvedores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve hasta el tope y avisa si hay más", async () => {
    const filas = Array.from({ length: PRODUCT_MATCH_LIMIT }, (_, i) => ({
      id: `${i}`,
      name: `Cuaderno Stitch ${i}`,
      price: 18000,
      stock: 4,
    }));
    mocks.findMany.mockResolvedValue(filas);
    mocks.count.mockResolvedValue(PRODUCT_MATCH_LIMIT + 3);

    const fact = await resolveProductSearch("store-1", clasificacion);
    expect(fact.known).toBe(true);
    if (!fact.known) return;
    expect(fact.value.matches).toHaveLength(PRODUCT_MATCH_LIMIT);
    expect(fact.value.hasMore).toBe(true);
  });

  it("no avisa de más cuando caben todos", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "1", name: "Cuaderno Stitch", price: 18000, stock: 4 },
      { id: "2", name: "Libreta Stitch", price: 12000, stock: 0 },
    ]);
    mocks.count.mockResolvedValue(2);

    const fact = await resolveProductSearch("store-1", clasificacion);
    if (!fact.known) throw new Error("debería saberse");
    expect(fact.value.hasMore).toBe(false);
  });

  it("cero resultados SÍ se sabe: es «no lo tengo»", async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    const fact = await resolveProductSearch("store-1", clasificacion);
    expect(fact).toEqual({
      known: true,
      value: { matches: [], ids: [], total: 0, hasMore: false, photo: null },
    });
  });

  it("no se sabe solo cuando no hay nada que buscar", async () => {
    const fact = await resolveProductSearch("store-1", {
      intent: "product.search",
      productType: null,
      character: null,
      descriptor: null,
    });
    expect(fact).toEqual({ known: false });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("pide a la base SOLO los campos que necesita", async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    await resolveAvailability("store-1", clasificacion);
    const args = mocks.findMany.mock.calls[0][0];
    // Lo de siempre, más la foto; nada más. `stock` y lo apartado entran aquí y salen booleano;
    // categoría y grupo solo sirven para buscar las ofertas vigentes.
    expect(Object.keys(args.select).sort()).toEqual([
      "categoryId",
      "id",
      "images",
      "name",
      "price",
      "productGroupId",
      "reservedUnits",
      "stock",
    ]);
    expect(args.select.images).toEqual({
      where: { brokenAt: null },
      orderBy: { isMain: "desc" },
      select: { url: true },
      take: 1,
    });
    expect(args.where.isArchived).toBe(false);
    expect(args.orderBy).toEqual([
      { soldCount: "desc" },
      { createdAt: "desc" },
    ]);
    expect(args.take).toBe(PRODUCT_MATCH_LIMIT);
  });

  it("la disponibilidad sale como sí o no, nunca como número", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "1", name: "Cartuchera Capibara", price: 30000, stock: 7 },
    ]);
    mocks.count.mockResolvedValue(1);

    const fact = await resolveAvailability("store-1", clasificacion);
    expect(fact.known).toBe(true);
    if (!fact.known) return;
    expect(fact.value.matches).toEqual([
      { name: "Cartuchera Capibara", inStock: true },
    ]);
    // El 7 no sobrevive a la función.
    expect(JSON.stringify(fact.value)).not.toContain("7");
    expect(Object.keys(fact.value.matches[0])).toEqual(["name", "inStock"]);
  });
});

describe("plantillas", () => {
  const search = (
    matches: { name: string; price: number }[],
    total: number,
  ) => ({
    matches,
    total,
    hasMore: total > matches.length,
  });

  it("uno solo: contesta derecho", () => {
    const texto = renderProductSearch(
      search([{ name: "Cuaderno Stitch", price: 18000 }], 1),
    );
    expect(texto).toContain("Cuaderno Stitch");
    expect(texto).toContain("$18.000");
    expect(texto).not.toContain("•");
  });

  it("dos o tres: los lista y pregunta cuál", () => {
    const texto = renderProductSearch(
      search(
        [
          { name: "Cuaderno Stitch", price: 18000 },
          { name: "Libreta Stitch", price: 12000 },
        ],
        2,
      ),
    );
    expect(texto).toContain("• Cuaderno Stitch — $18.000");
    expect(texto).toContain("• Libreta Stitch — $12.000");
    expect(texto).toMatch(/cuál te interesa/i);
  });

  it("más de tres: lista tres y dice cuántos quedan", () => {
    const texto = renderProductSearch(
      search(
        [
          { name: "A", price: 1000 },
          { name: "B", price: 2000 },
          { name: "C", price: 3000 },
        ],
        6,
      ),
    );
    expect(texto).toContain("y 3 más");
    expect(texto).toMatch(/cuál te interesa/i);
  });

  it("ninguno: NO dice que no lo tiene; dice que lo confirma con Paula", () => {
    // El fallo real del 30 de septiembre: «tote bag de perrito» dio cero y el
    // bot contestó «no lo tengo» con el producto activo y con existencias.
    // Cero resultados es «no lo encontré», y eso se dice como lo que es.
    const texto = renderProductSearch(search([], 0));
    expect(texto).toBe(PRODUCT_TEMPLATES["search.unsure"]());
    expect(texto).not.toMatch(/no lo tengo/i);
    expect(texto).toMatch(/Paula/);
  });

  it("al no encontrar, no se vuelve a preguntar qué buscaba ni se niega nada", () => {
    // Ya lo dijo en su mensaje; volver a preguntarlo se lee a formulario. Y
    // las cinco intenciones caen en el mismo texto cauteloso.
    const sinNada = { matches: [], total: 0, hasMore: false };
    for (const texto of [
      renderProductSearch(sinNada),
      renderProductPrice(sinNada),
      renderProductFeatures(sinNada),
      renderProductPhoto({ ...sinNada, photo: null }),
      renderAvailability({ matches: [], total: 0, hasMore: false }),
    ]) {
      expect(texto).not.toMatch(/buscabas/i);
      expect(texto).not.toMatch(/no lo tengo|se me agot/i);
      expect(texto).toBe(PRODUCT_TEMPLATES["search.unsure"]());
    }
  });

  it("disponibilidad: sí, agotado y varios", () => {
    const uno = (inStock: boolean) => ({
      matches: [{ name: "Cartuchera Capibara", inStock }],
      total: 1,
      hasMore: false,
    });
    expect(renderAvailability(uno(true))).toMatch(/disponible/i);
    expect(renderAvailability(uno(false))).toMatch(/agot/i);
    const varios = renderAvailability({
      matches: [
        { name: "Cartuchera Capibara", inStock: true },
        { name: "Cartuchera grande", inStock: false },
      ],
      total: 2,
      hasMore: false,
    });
    expect(varios).toMatch(/cuál te interesa/i);
  });

  it("NINGÚN texto deja escapar una cantidad", () => {
    // El guardián: si alguien reescribe una plantilla y mete el número de
    // existencias, esto lo caza antes de que llegue a una clienta.
    const prohibido = /\d+\s*(unidad|unidades|disponibles?|quedan?)/i;
    for (const item of previewProductTemplates()) {
      expect(item.text).not.toMatch(prohibido);
    }
    // Y también con datos que sí traen números de stock por detrás.
    const conStock = renderAvailability({
      matches: [
        { name: "Cartuchera", inStock: true },
        { name: "Libreta", inStock: false },
      ],
      total: 9,
      hasMore: true,
    });
    expect(conStock).not.toMatch(prohibido);
  });
});

describe("clasificador: lo que pasa cuando falla", () => {
  beforeEach(() => vi.clearAllMocks());

  it("acepta una respuesta que cuadra con el esquema", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.search",
        productType: "cuaderno",
        character: "Stitch",
        descriptor: null,
      },
    });
    const r = await classifyProductQuestion("¿tienen cuadernos de Stitch?");
    expect(r).toEqual({
      ok: true,
      value: {
        intent: "product.search",
        productType: "cuaderno",
        character: "Stitch",
        descriptor: null,
      },
    });
  });

  it("pide una sola llamada a OpenAI, sin guardar la conversación y con corte por tiempo", async () => {
    mocks.generateText.mockResolvedValue({
      output: { intent: "other", productType: null, character: null },
    });
    await classifyProductQuestion("hola");
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    const args = mocks.generateText.mock.calls[0][0];
    expect(args.model).toBe("openai-model");
    expect(args.providerOptions.openai.store).toBe(false);
    expect(args.maxRetries).toBe(0);
    expect(args.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("el mensaje de la clienta nunca va a Gemini, ni cuando OpenAI falla", async () => {
    mocks.generateText.mockRejectedValue(
      Object.assign(new Error("Internal error"), { statusCode: 503 }),
    );
    expect(
      await classifyProductQuestion("¿tienen algo de Kuromi?"),
    ).toMatchObject({ ok: false });
    expect(mocks.createGoogle).not.toHaveBeenCalled();
    expect(
      mocks.generateText.mock.calls.every(
        ([call]) => call.model === "openai-model",
      ),
    ).toBe(true);
  });

  it("CUOTA AGOTADA: un 429 de OpenAI se reconoce como cuota y sigue con palabras clave", async () => {
    mocks.generateText.mockRejectedValue(
      Object.assign(new Error("Rate limit reached"), {
        statusCode: 429,
        responseBody: JSON.stringify({
          error: { type: "rate_limit_exceeded" },
        }),
      }),
    );
    expect(await classifyProductQuestion("¿tienen algo de Kuromi?")).toEqual({
      ok: false,
      reason: "quota",
    });
  });

  it("TIEMPO AGOTADO: se reconoce el corte por tiempo", async () => {
    mocks.generateText.mockRejectedValue(
      Object.assign(new Error("The operation was aborted due to timeout"), {
        name: "TimeoutError",
      }),
    );
    expect(await classifyProductQuestion("¿queda algo?")).toEqual({
      ok: false,
      reason: "timeout",
    });
  });

  it("RESPUESTA QUE NO CUADRA: se descarta en vez de creérsela", async () => {
    mocks.generateText.mockResolvedValue({
      output: { intent: "inventado", productType: 42, character: [] },
    });
    expect(await classifyProductQuestion("¿tienen algo?")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("OTRO ERROR: cualquier otra cosa también se queda aquí", async () => {
    mocks.generateText.mockRejectedValue(new Error("socket hang up"));
    expect(await classifyProductQuestion("¿tienen algo?")).toEqual({
      ok: false,
      reason: "error",
    });
  });
});

describe("clasificador + resolvedor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("búsqueda: de la pregunta al texto con datos reales", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.search",
        productType: "cuaderno",
        character: "Stitch",
        descriptor: null,
      },
    });
    mocks.findMany.mockResolvedValue([
      { id: "1", name: "Cuaderno Stitch", price: 18000, stock: 3 },
    ]);
    mocks.count.mockResolvedValue(1);

    const r = await answerProductQuestion(
      "store-1",
      "¿tienen cuadernos de Stitch?",
    );
    expect(r?.intent).toBe("product.search");
    expect(r?.text).toContain("Cuaderno Stitch");
    expect(r?.text).toContain("$18.000");
  });

  it("disponibilidad: de la pregunta al sí o no", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.availability",
        productType: "cartuchera",
        character: "capibara",
      },
    });
    mocks.findMany.mockResolvedValue([
      { id: "1", name: "Cartuchera Capibara", price: 30000, stock: 5 },
    ]);
    mocks.count.mockResolvedValue(1);

    const r = await answerProductQuestion(
      "store-1",
      "¿queda cartuchera de capibara?",
    );
    expect(r?.intent).toBe("product.availability");
    expect(r?.text).toMatch(/disponible/i);
    expect(r?.text).not.toContain("5");
  });

  it("con la cuota agotada no contesta nada y deja seguir", async () => {
    mocks.generateText.mockRejectedValue(
      new Error("You exceeded your current quota"),
    );
    expect(
      await answerProductQuestion("store-1", "¿tienen algo de Kuromi?"),
    ).toBeNull();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("«other» no se contesta aquí", async () => {
    mocks.generateText.mockResolvedValue({
      output: { intent: "other", productType: null, character: null },
    });
    expect(
      await answerProductQuestion("store-1", "¿tienen envío gratis?"),
    ).toBeNull();
  });

  it("un saludo ni siquiera llega al modelo", async () => {
    expect(await answerProductQuestion("store-1", "gracias!!")).toBeNull();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});

describe("visto bueno, aparte del de los datos del negocio", () => {
  it("hace falta la fecha y la versión de ESTOS textos", () => {
    const base = {
      botProductsApprovedAt: new Date("2026-09-15T00:00:00.000Z"),
      botProductsVersion: PRODUCT_TEMPLATES_VERSION,
    };
    expect(areProductAnswersApproved(base)).toBe(true);
    expect(
      areProductAnswersApproved({ ...base, botProductsApprovedAt: null }),
    ).toBe(false);
    expect(
      areProductAnswersApproved({ ...base, botProductsVersion: "vieja" }),
    ).toBe(false);
  });

  it("la consulta se arma con las dos ranuras", () => {
    expect(buildSearchQuery(clasificacion)).toBe("cuaderno Stitch");
    expect(
      buildSearchQuery({
        intent: "product.search",
        productType: null,
        character: "Kuromi",
        descriptor: null,
      }),
    ).toBe("Kuromi");
  });
});

// ===================== B2: precio y características =====================

/** Tal cual está guardada en producción, con el marcado del editor. */
const DESCRIPCION_REAL =
  "<p>Lleva tu identificación con la ternura y diversión de <strong>Doraemon</strong>. " +
  "Este portacarnet cuenta con un diseño inspirado en el famoso gato cósmico, acompañado " +
  "de una <strong>cinta para cuello estampada</strong>, ideal para mantener tu carnet " +
  "siempre al alcance.</p><p>Incluye un <strong>protector rígido transparente</strong> " +
  "para cuidar tu identificación.</p><ul><li>Cinta ajustable</li><li>Gancho de liberación rápida</li></ul>";

describe("limpiar la descripción", () => {
  it("quita el marcado real del editor y deja un mensaje legible", () => {
    const limpio = cleanDescription(DESCRIPCION_REAL);
    expect(limpio).not.toMatch(/<[^>]+>/);
    expect(limpio).toContain("Doraemon");
    expect(limpio).toContain("cinta para cuello estampada");
    // Las viñetas se conservan como viñetas.
    expect(limpio).toContain("• Cinta ajustable");
    expect(limpio).toContain("• Gancho de liberación rápida");
    // Los párrafos siguen separados, pero sin huecos enormes.
    expect(limpio).toContain("\n\n");
    expect(limpio).not.toMatch(/\n{3,}/);
    expect(limpio.startsWith(" ")).toBe(false);
  });

  it("convierte los saltos de línea y no deja entidades sueltas", () => {
    expect(cleanDescription("<p>uno<br>dos</p>")).toBe("uno\ndos");
    expect(cleanDescription("<p>tinta &amp; papel&nbsp;fino</p>")).toBe(
      "tinta & papel fino",
    );
  });

  it("una descripción vacía o nula no revienta", () => {
    expect(cleanDescription(null)).toBe("");
    expect(cleanDescription("")).toBe("");
    expect(cleanDescription("<p></p>")).toBe("");
  });

  it("recorta lo muy largo por la última frase entera", () => {
    const largo = `${"Una frase de relleno bastante larga. ".repeat(40)}`;
    const corto = trimForWhatsApp(largo);
    expect(corto.length).toBeLessThanOrEqual(620);
    expect(corto.endsWith("…")).toBe(true);
    expect(trimForWhatsApp("corto")).toBe("corto");
  });
});

describe("precio", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uno solo: lo dice derecho", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "1", name: "Cuaderno Stitch", price: 18000, stock: 3 },
    ]);
    mocks.count.mockResolvedValue(1);
    const fact = await resolveProductPrice("store-1", {
      ...clasificacion,
      intent: "product.price",
    });
    expect(fact.known).toBe(true);
    if (!fact.known) return;
    const texto = renderProductPrice(fact.value);
    expect(texto).toContain("Cuaderno Stitch");
    expect(texto).toContain("$18.000");
  });

  it("dos o tres: la lista YA lleva los precios, así que contesta igual", () => {
    const texto = renderProductPrice({
      matches: [
        { name: "Cuaderno Stitch", price: 18000 },
        { name: "Libreta Stitch", price: 12000 },
      ],
      total: 2,
      hasMore: false,
    });
    // Los dos precios salen en el mismo mensaje: no hace falta otra vuelta.
    expect(texto).toContain("$18.000");
    expect(texto).toContain("$12.000");
    expect(texto).toMatch(/cuál te interesa/i);
  });

  it("más de tres: tres con precio y cuántos faltan", () => {
    const texto = renderProductPrice({
      matches: [
        { name: "A", price: 1000 },
        { name: "B", price: 2000 },
        { name: "C", price: 3000 },
      ],
      total: 7,
      hasMore: true,
    });
    expect(texto).toContain("$1.000");
    expect(texto).toContain("y 4 más");
  });

  it("ninguno: lo mismo que la búsqueda, con cautela", () => {
    expect(renderProductPrice({ matches: [], total: 0, hasMore: false })).toBe(
      PRODUCT_TEMPLATES["search.unsure"](),
    );
  });
});

describe("características", () => {
  beforeEach(() => vi.clearAllMocks());

  const unSoloCon = (description: string) => {
    mocks.findMany.mockResolvedValue([
      {
        id: "1",
        name: "Portacarnet Doraemon",
        price: 15000,
        stock: 2,
        description,
      },
    ]);
    mocks.count.mockResolvedValue(1);
  };

  it("con una descripción de verdad, la cuenta ya limpia", async () => {
    unSoloCon(DESCRIPCION_REAL);
    const fact = await resolveProductFeatures("store-1", {
      ...clasificacion,
      intent: "product.features",
    });
    expect(fact.known).toBe(true);
    if (!fact.known) return;
    const texto = renderProductFeatures(fact.value);
    expect(texto).toContain("Portacarnet Doraemon");
    expect(texto).toContain("Doraemon");
    expect(texto).not.toMatch(/<[^>]+>/);
    expect(texto).not.toContain("&amp;");
  });

  it("pide la descripción a la base SOLO en este caso", async () => {
    unSoloCon(DESCRIPCION_REAL);
    await resolveProductFeatures("store-1", {
      ...clasificacion,
      intent: "product.features",
    });
    expect(mocks.findMany.mock.calls[0][0].select.description).toBe(true);

    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    await resolveProductSearch("store-1", clasificacion);
    expect(mocks.findMany.mock.calls[0][0].select.description).toBeUndefined();
  });

  it("DESCRIPCIÓN VACÍA: no se inventa nada, se escala", async () => {
    unSoloCon("");
    expect(
      await resolveProductFeatures("store-1", {
        ...clasificacion,
        intent: "product.features",
      }),
    ).toEqual({ known: false });
  });

  it("DESCRIPCIÓN CORTA PERO NO VACÍA: también se escala", async () => {
    // Caso distinto del vacío a propósito: «Borrador rosado.» es texto real,
    // pero contarlo como respuesta se lee peor que pasárselo a Paula.
    const corta = "<p>Borrador rosado.</p>";
    expect(cleanDescription(corta).length).toBeLessThan(
      MIN_USEFUL_DESCRIPTION_LENGTH,
    );
    unSoloCon(corta);
    expect(
      await resolveProductFeatures("store-1", {
        ...clasificacion,
        intent: "product.features",
      }),
    ).toEqual({ known: false });
  });

  it("justo en el umbral sí se cuenta", async () => {
    const justa = `<p>${"a".repeat(MIN_USEFUL_DESCRIPTION_LENGTH)}</p>`;
    unSoloCon(justa);
    const fact = await resolveProductFeatures("store-1", {
      ...clasificacion,
      intent: "product.features",
    });
    expect(fact.known).toBe(true);
  });

  it("con varios candidatos pregunta cuál, sin descripciones", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "1",
        name: "Cuaderno Stitch",
        price: 18000,
        stock: 1,
        description: DESCRIPCION_REAL,
      },
      {
        id: "2",
        name: "Libreta Stitch",
        price: 12000,
        stock: 1,
        description: DESCRIPCION_REAL,
      },
    ]);
    mocks.count.mockResolvedValue(2);
    const fact = await resolveProductFeatures("store-1", {
      ...clasificacion,
      intent: "product.features",
    });
    expect(fact.known).toBe(true);
    if (!fact.known) return;
    const texto = renderProductFeatures(fact.value);
    expect(texto).toMatch(/cuál/i);
    expect(texto).toContain("Cuaderno Stitch");
    // No se vuelca la descripción de dos productos en un mensaje.
    expect(texto).not.toContain("Doraemon");
  });
});

describe("las dos intenciones nuevas, de la pregunta al texto", () => {
  beforeEach(() => vi.clearAllMocks());

  it("precio", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.price",
        productType: "cuaderno",
        character: "Stitch",
      },
    });
    mocks.findMany.mockResolvedValue([
      { id: "1", name: "Cuaderno Stitch", price: 18000, stock: 3 },
    ]);
    mocks.count.mockResolvedValue(1);
    const r = await answerProductQuestion(
      "store-1",
      "cuánto cuesta el cuaderno de Stitch",
    );
    expect(r?.intent).toBe("product.price");
    expect(r?.text).toContain("$18.000");
  });

  it("características", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.features",
        productType: "portacarnet",
        character: "Doraemon",
      },
    });
    mocks.findMany.mockResolvedValue([
      {
        id: "1",
        name: "Portacarnet Doraemon",
        price: 15000,
        stock: 2,
        description: DESCRIPCION_REAL,
      },
    ]);
    mocks.count.mockResolvedValue(1);
    const r = await answerProductQuestion(
      "store-1",
      "de qué material es el portacarnet de Doraemon?",
    );
    expect(r?.intent).toBe("product.features");
    expect(r?.text).not.toMatch(/<[^>]+>/);
  });

  it("características con descripción pobre no contesta: deja seguir", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.features",
        productType: "borrador",
        character: null,
      },
    });
    mocks.findMany.mockResolvedValue([
      {
        id: "1",
        name: "Borrador",
        price: 2000,
        stock: 9,
        description: "<p>Rosado.</p>",
      },
    ]);
    mocks.count.mockResolvedValue(1);
    expect(
      await answerProductQuestion("store-1", "cómo es el borrador?"),
    ).toBeNull();
  });

  it.each([
    [
      "cuota",
      new Error("You exceeded your current quota, please check your plan"),
    ],
    [
      "tiempo",
      Object.assign(new Error("operation was aborted due to timeout"), {
        name: "TimeoutError",
      }),
    ],
    ["transporte", new Error("socket hang up")],
  ])(
    "precio y características también se caen bien si el modelo falla por %s",
    async (_motivo, error) => {
      mocks.generateText.mockRejectedValue(error);
      expect(
        await answerProductQuestion(
          "store-1",
          "cuánto cuesta el cuaderno de Stitch",
        ),
      ).toBeNull();
      expect(
        await answerProductQuestion("store-1", "de qué material es la agenda?"),
      ).toBeNull();
      expect(mocks.findMany).not.toHaveBeenCalled();
    },
  );

  it("una respuesta con una intención inventada no se cuela como precio", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.cost",
        productType: "cuaderno",
        character: null,
      },
    });
    // Con «Stitch», que no es del catálogo, la pregunta sí pasa por el modelo.
    expect(
      await answerProductQuestion("store-1", "cuánto cuesta el cuaderno de Stitch"),
    ).toBeNull();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("el portero deja pasar las preguntas de precio y de cómo es", () => {
    for (const q of [
      "cuánto cuesta el cuaderno de Stitch",
      "cuanto vale ese llavero",
      "de qué material es la agenda?",
      "qué tamaño tiene el planeador",
      "qué trae el kit escolar?",
    ]) {
      expect(looksLikeProductQuestion(q)).toBe(true);
    }
  });
});

// ===================== Fotos =====================

const FOTO_CRUDA =
  "https://res.cloudinary.com/dsogxa0hj/image/upload/v1785959687/ozk0z5nxhcqi0xv42he2.jpg";
const FOTO_LISTA =
  "https://res.cloudinary.com/dsogxa0hj/image/upload/f_auto,q_auto,c_limit,w_1600/v1785959687/ozk0z5nxhcqi0xv42he2.jpg";

describe("elegir la foto", () => {
  it("la pasa por la transformación de siempre", () => {
    expect(pickPhoto([{ url: FOTO_CRUDA }])).toBe(FOTO_LISTA);
    // Ese ancho ya lo usan tienda y panel: pedir otro crearía copias nuevas.
    expect(PHOTO_WIDTH).toBe(1600);
    expect(pickPhoto([{ url: FOTO_CRUDA }])).toContain(
      "f_auto,q_auto,c_limit,w_1600",
    );
  });

  it("sin fotos devuelve null, que no es un error", () => {
    expect(pickPhoto([])).toBeNull();
    expect(pickPhoto(undefined)).toBeNull();
  });

  it("la consulta ya trae la principal y descarta las rotas", async () => {
    // El orden y el filtro los pone Prisma; aquí se comprueba que se piden.
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    await resolveProductSearch("store-1", clasificacion);
    const { images } = mocks.findMany.mock.calls[0][0].select;
    expect(images.where).toEqual({ brokenAt: null });
    expect(images.orderBy).toEqual({ isMain: "desc" });
    expect(images.take).toBe(1);
  });
});

describe("la foto viaja con las respuestas de un solo producto", () => {
  beforeEach(() => vi.clearAllMocks());

  const unSolo = (
    images: { url: string }[],
    extra: Record<string, unknown> = {},
  ) => {
    mocks.findMany.mockResolvedValue([
      {
        id: "1",
        name: "Separador Harry",
        price: 9000,
        stock: 4,
        images,
        ...extra,
      },
    ]);
    mocks.count.mockResolvedValue(1);
  };

  it("búsqueda, disponibilidad y precio la llevan", async () => {
    for (const resolver of [
      resolveProductSearch,
      resolveAvailability,
      resolveProductPrice,
    ]) {
      vi.clearAllMocks();
      unSolo([{ url: FOTO_CRUDA }]);
      const fact = await resolver("store-1", clasificacion);
      expect(fact.known).toBe(true);
      if (!fact.known) return;
      expect(fact.value.photo).toBe(FOTO_LISTA);
    }
  });

  it("características también", async () => {
    unSolo([{ url: FOTO_CRUDA }], { description: DESCRIPCION_REAL });
    const fact = await resolveProductFeatures("store-1", {
      ...clasificacion,
      intent: "product.features",
    });
    expect(fact.known).toBe(true);
    if (!fact.known) return;
    expect(fact.value.photo).toBe(FOTO_LISTA);
  });

  it("con VARIOS productos no va ninguna foto", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "1",
        name: "A",
        price: 1000,
        stock: 1,
        images: [{ url: FOTO_CRUDA }],
      },
      {
        id: "2",
        name: "B",
        price: 2000,
        stock: 1,
        images: [{ url: FOTO_CRUDA }],
      },
    ]);
    mocks.count.mockResolvedValue(2);
    const fact = await resolveProductSearch("store-1", clasificacion);
    expect(fact.known && fact.value.photo).toBeNull();
  });

  it("los ~9 productos sin foto utilizable: photo null y el texto sale igual", async () => {
    unSolo([]);
    const fact = await resolveProductSearch("store-1", clasificacion);
    expect(fact.known).toBe(true);
    if (!fact.known) return;
    expect(fact.value.photo).toBeNull();
    // Lo importante: la respuesta existe igual, sin disculpa ni escalado.
    expect(renderProductSearch(fact.value)).toContain("Separador Harry");
  });
});

describe("intención: pedir una foto", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uno solo con foto: texto corto, la foto habla", () => {
    const texto = renderProductPhoto({
      matches: [{ name: "Separador Harry", price: 9000 }],
      total: 1,
      hasMore: false,
      photo: FOTO_LISTA,
    });
    expect(texto).toContain("Separador Harry");
    expect(texto).toContain("$9.000");
    expect(texto.length).toBeLessThan(120);
  });

  it("uno solo SIN foto: aquí sí se avisa, porque era lo que pedía", () => {
    const texto = renderProductPhoto({
      matches: [{ name: "Separador Harry", price: 9000 }],
      total: 1,
      hasMore: false,
      photo: null,
    });
    expect(texto).toMatch(/no tengo foto/i);
    expect(texto).toContain("Paula");
  });

  it("varios: lista y pregunta cuál, sin mandar foto", () => {
    const texto = renderProductPhoto({
      matches: [
        { name: "A", price: 1000 },
        { name: "B", price: 2000 },
      ],
      total: 2,
      hasMore: false,
      photo: null,
    });
    expect(texto).toMatch(/cuál te interesa/i);
  });

  it("ninguno: el mismo «déjame confirmarlo» de las demás intenciones", () => {
    expect(
      renderProductPhoto({
        matches: [],
        total: 0,
        hasMore: false,
        photo: null,
      }),
    ).toBe(PRODUCT_TEMPLATES["search.unsure"]());
  });

  it("de la pregunta al mensaje con foto", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.photo",
        productType: "separador",
        character: "Harry",
      },
    });
    mocks.findMany.mockResolvedValue([
      {
        id: "1",
        name: "Separador Harry",
        price: 9000,
        stock: 4,
        images: [{ url: FOTO_CRUDA }],
      },
    ]);
    mocks.count.mockResolvedValue(1);
    const r = await answerProductQuestion(
      "store-1",
      "mándame una foto del separador de Harry",
    );
    expect(r?.intent).toBe("product.photo");
    expect(r?.photo).toBe(FOTO_LISTA);
  });

  it("el portero deja pasar las formas de pedir una foto", () => {
    for (const q of [
      "mándame una foto del cuaderno",
      "cómo se ve el separador?",
      "tienes fotos de la agenda?",
      "muéstrame el llavero",
    ]) {
      expect(looksLikeProductQuestion(q)).toBe(true);
    }
  });
});

// ============ La conversación real del 2026-09-15 (morado pastel) ============

describe("lo que distingue un producto de otro: la ranura descriptor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("el color entra en la consulta, que antes se quedaba vacía", () => {
    // El fallo real: «Muéstrame el morado pastel» no traía ni tipo ni
    // personaje, así que la consulta salía vacía y la clienta acababa en
    // «Esa no me la sé», aunque «morado pastel» encuentre ese cuaderno y
    // solo ese.
    expect(
      buildSearchQuery({
        intent: "product.photo",
        productType: null,
        character: null,
        descriptor: "morado pastel",
      }),
    ).toBe("morado pastel");
  });

  it("EL BUCLE: tipo + color van juntos, no solo el tipo", () => {
    // Antes «Muéstrame el cuaderno morado pastel» sacaba solo «cuaderno»:
    // 160 productos, la misma lista genérica otra vez, y vuelta a empezar.
    const q = buildSearchQuery({
      intent: "product.photo",
      productType: "cuaderno",
      character: null,
      descriptor: "morado pastel",
    });
    expect(q).toBe("cuaderno morado pastel");
    expect(searchTokens(q)).toEqual(["cuaderno", "morado", "pastel"]);
  });

  it("las tres ranuras caben juntas", () => {
    expect(
      buildSearchQuery({
        intent: "product.search",
        productType: "cuaderno",
        character: "Stitch",
        descriptor: "morado pastel",
      }),
    ).toBe("cuaderno Stitch morado pastel");
  });

  it("una ranura que el modelo no manda no tira la clasificación entera", () => {
    // `nullish`: perder un matiz es mejor que perder la respuesta.
    const parsed = productClassificationSchema.safeParse({
      intent: "product.search",
      productType: "cuaderno",
      // sin `character` ni `descriptor`
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.descriptor).toBeNull();
    expect(parsed.success && parsed.data.character).toBeNull();
  });
});

describe("la red de seguridad: buscar el mensaje en crudo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("quita la cortesía y deja lo que se busca", () => {
    expect(fallbackQueryFromMessage("Muéstrame el morado pastel")).toBe(
      "morado pastel",
    );
    expect(fallbackQueryFromMessage("¿Tienes el cuaderno azul?")).toBe(
      "cuaderno azul",
    );
    expect(fallbackQueryFromMessage("hola, quiero un llavero porfa")).toBe(
      "llavero",
    );
  });

  it("si no queda nada útil, devuelve vacío y se escala", () => {
    expect(fallbackQueryFromMessage("muéstrame el")).toBe("");
    expect(fallbackQueryFromMessage("hola gracias")).toBe("");
    expect(fallbackQueryFromMessage("")).toBe("");
  });

  it("se usa cuando las tres ranuras vienen vacías", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.photo",
        productType: null,
        character: null,
        descriptor: null,
      },
    });
    mocks.findMany.mockResolvedValue([
      {
        id: "1",
        name: "Cuadernos Stitch Morado pastel",
        price: 13000,
        stock: 4,
        images: [],
      },
    ]);
    mocks.count.mockResolvedValue(1);

    const r = await answerProductQuestion(
      "store-1",
      "Muéstrame el morado pastel",
    );
    expect(r).not.toBeNull();
    expect(r?.text).toContain("Cuadernos Stitch Morado pastel");
    // Buscó «morado pastel», no la frase entera ni una cadena vacía.
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(2);
  });

  it("si ni la red encuentra palabras, no se contesta y sigue el camino", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.search",
        productType: null,
        character: null,
        descriptor: null,
      },
    });
    expect(await answerProductQuestion("store-1", "muéstrame el")).toBeNull();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});

describe("lo que sigue SIN resolverse (hace falta memoria de conversación)", () => {
  it("un ordinal no trae nada que buscar, y eso no cambia aquí", () => {
    // «el primero» / «ese» no tienen palabras del producto: sin recordar la
    // lista que se acaba de mandar, no hay forma. Queda fuera de este arreglo.
    for (const frase of ["el primero", "ese", "el segundo", "quiero ese"]) {
      expect(fallbackQueryFromMessage(frase)).toBe("");
    }
  });
});

// ============ Primero el nombre; la descripción solo si hace falta ============

describe("buscar primero por nombre", () => {
  beforeEach(() => vi.clearAllMocks());

  it("la primera pasada no mira la descripción (las etiquetas sí)", () => {
    const where = productNameTokenSearchWhere("borrador morado");
    expect(where).toHaveLength(2);
    for (const clausula of where) {
      const claves = clausula.OR!.map((c: any) => Object.keys(c)[0]);
      expect(claves).not.toContain("description");
      expect(claves).toContain("name");
      // Diseño, color, categoría y grupo entran desde el fallo del tote bag.
      expect(claves).toEqual(
        expect.arrayContaining(["design", "color", "category", "productGroup"]),
      );
    }
    // La amplia sí la mira: son dos consultas distintas a propósito.
    const amplia = productTokenSearchWhere("borrador morado");
    expect(JSON.stringify(amplia)).toContain("description");
  });

  it("si el nombre encuentra algo, NO se vuelve a consultar", async () => {
    // El caso ruidoso: «borrador morado» daba 6 productos mirando también las
    // descripciones (colores mencionados de pasada en otros productos) y da 1
    // mirando solo el nombre.
    mocks.findMany.mockResolvedValue([
      {
        id: "1",
        name: "Borrador Morado fluorescente",
        price: 1800,
        stock: 9,
        images: [],
      },
    ]);
    mocks.count.mockResolvedValue(1);

    const fact = await resolveProductSearch("store-1", {
      intent: "product.search",
      productType: "borrador",
      character: null,
      descriptor: "morado",
    });
    expect(fact.known && fact.value.total).toBe(1);
    // Una sola pasada.
    expect(mocks.count).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.findMany.mock.calls[0][0].where)).not.toContain(
      "description",
    );
  });

  it("si el nombre no encuentra nada, SÍ se amplía a la descripción", async () => {
    // «agenda grande»: por nombre no hay ninguna, pero el tamaño está escrito
    // en la descripción de dos productos. Perderlos sería peor que el ruido.
    mocks.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: "1", name: "Agenda ejecutiva", price: 30000, stock: 3, images: [] },
      { id: "2", name: "Agenda semanal", price: 28000, stock: 1, images: [] },
    ]);

    const fact = await resolveProductSearch("store-1", {
      intent: "product.search",
      productType: "agenda",
      character: null,
      descriptor: "grande",
    });
    expect(fact.known && fact.value.total).toBe(2);
    // Dos pasadas: la segunda ya mira la descripción.
    expect(mocks.count).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(mocks.findMany.mock.calls[0][0].where)).not.toContain(
      "description",
    );
    expect(JSON.stringify(mocks.findMany.mock.calls[1][0].where)).toContain(
      "description",
    );
  });

  it("si no hay nada por ningún lado, se responde que no se tiene", async () => {
    mocks.count.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);
    const fact = await resolveProductSearch("store-1", {
      intent: "product.search",
      productType: "termo",
      character: null,
      descriptor: "de acero",
    });
    expect(fact.known && fact.value.total).toBe(0);
    expect(mocks.count).toHaveBeenCalledTimes(2);
  });

  it("los casos del arreglo anterior siguen resolviéndose por nombre", async () => {
    // «morado pastel» y «cuaderno morado pastel» ya daban 1 producto: el orden
    // nuevo no puede cambiarlos.
    for (const descriptor of ["morado pastel"]) {
      for (const productType of [null, "cuaderno"]) {
        vi.clearAllMocks();
        mocks.findMany.mockResolvedValue([
          {
            id: "1",
            name: "Cuadernos Stitch Morado pastel",
            price: 13000,
            stock: 4,
            images: [],
          },
        ]);
        mocks.count.mockResolvedValue(1);
        const fact = await resolveProductSearch("store-1", {
          intent: "product.photo",
          productType,
          character: null,
          descriptor,
        });
        expect(fact.known && fact.value.total).toBe(1);
        expect(mocks.count).toHaveBeenCalledOnce();
      }
    }
  });
});

describe("los ids viajan con la respuesta, para poder señalar después", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("guarda los ids en el mismo orden en que salen escritos", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "p1", name: "Cuaderno Stitch", price: 18000, stock: 4, images: [] },
      { id: "p2", name: "Libreta Stitch", price: 12000, stock: 0, images: [] },
    ]);
    mocks.count.mockResolvedValue(2);

    const fact = await resolveProductSearch("store-1", clasificacion);
    if (!fact.known) throw new Error("debería saberse");
    expect(fact.value.ids).toEqual(["p1", "p2"]);
    expect(fact.value.matches.map((m) => m.name)).toEqual([
      "Cuaderno Stitch",
      "Libreta Stitch",
    ]);
  });

  it("el id nunca sale escrito en el texto", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "clave-secreta-123",
        name: "Cuaderno Stitch",
        price: 18000,
        stock: 4,
        images: [],
      },
    ]);
    mocks.count.mockResolvedValue(1);

    const fact = await resolveProductSearch("store-1", clasificacion);
    if (!fact.known) throw new Error("debería saberse");
    expect(renderProductSearch(fact.value)).not.toContain("clave-secreta-123");
  });
});

describe("contestar de un producto que ya se sabe cuál es", () => {
  const producto = {
    id: "p1",
    name: "Cuaderno Stitch",
    price: 18000,
    stock: 4,
    description: null as string | null,
    images: [] as { url: string }[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(producto);
  });

  it("vuelve a consultar el catálogo: nunca usa el precio de hace diez minutos", async () => {
    mocks.findFirst.mockResolvedValue({ ...producto, price: 25000 });
    const answer = await answerAboutProduct("store-1", "p1", "product.price");
    expect(answer?.text).toContain("$25.000");
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1", storeId: "store-1", isArchived: false },
      }),
    );
  });

  it("contesta si queda, con las existencias de ahora", async () => {
    mocks.findFirst.mockResolvedValue({ ...producto, stock: 0 });
    const answer = await answerAboutProduct(
      "store-1",
      "p1",
      "product.availability",
    );
    expect(answer?.text).toContain("se me agotó");
    // Y el número no sale nunca.
    expect(answer?.text).not.toContain("0");
  });

  it("no inventa nada si el producto ya no está", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(
      answerAboutProduct("store-1", "p1", "product.search"),
    ).resolves.toBeNull();
  });

  it("no cuenta cómo es si la descripción no da para nada", async () => {
    mocks.findFirst.mockResolvedValue({
      ...producto,
      description: "<p>Lindo</p>",
    });
    await expect(
      answerAboutProduct("store-1", "p1", "product.features"),
    ).resolves.toBeNull();
  });

  it("cuenta cómo es cuando sí hay descripción", async () => {
    mocks.findFirst.mockResolvedValue({
      ...producto,
      description:
        "<p>Cuaderno argollado de 100 hojas con tapa dura ilustrada. Trae separador de páginas y bolsillo interior para guardar apuntes sueltos.</p>",
    });
    const answer = await answerAboutProduct(
      "store-1",
      "p1",
      "product.features",
    );
    expect(answer?.text).toContain("100 hojas");
    expect(answer?.text).not.toContain("<p>");
  });

  it("deja dicho qué producto enseñó, para poder volver a señalarlo", async () => {
    const answer = await answerAboutProduct("store-1", "p1", "product.search");
    expect(answer?.shownIds).toEqual(["p1"]);
  });

  it("manda la foto si el producto tiene una sana", async () => {
    mocks.findFirst.mockResolvedValue({
      ...producto,
      images: [
        { url: "https://res.cloudinary.com/demo/image/upload/v1/foto.jpg" },
      ],
    });
    const answer = await answerAboutProduct("store-1", "p1", "product.photo");
    expect(answer?.photo).toContain("foto.jpg");
  });
});

describe("cuando el modelo tarda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("espera lo que hace falta, con margen bajo el «escribiendo…» de Meta", () => {
    // Medido el 2026-09-15: hasta 30 s, 14 de mediana. Dos segundos y medio
    // tumbaban 7 de cada 8 llamadas.
    expect(PRODUCT_CLASSIFIER_TIMEOUT_MS).toBeGreaterThanOrEqual(15000);
    // Meta mantiene el indicador unos 25 s; hay que caber dentro con la
    // respuesta, no solo con la clasificación.
    expect(PRODUCT_CLASSIFIER_TIMEOUT_MS).toBeLessThanOrEqual(20000);
    expect(PRODUCT_CLASSIFIER_SLOW_NOTICE_MS).toBeLessThan(
      PRODUCT_CLASSIFIER_TIMEOUT_MS,
    );
  });

  it("avisa si se pasa del umbral, y sigue esperando la misma respuesta", async () => {
    vi.useFakeTimers();
    try {
      let soltar: (v: unknown) => void = () => undefined;
      mocks.generateText.mockReturnValue(
        new Promise((resolve) => {
          soltar = resolve;
        }),
      );
      mocks.findMany.mockResolvedValue([
        { id: "p1", name: "Lapicero gel", price: 5500, stock: 3, images: [] },
      ]);
      mocks.count.mockResolvedValue(1);

      const onSlow = vi.fn().mockResolvedValue(undefined);
      const pendiente = answerProductQuestion(
        "store-1",
        "tienen lapiceros en gel?",
        {
          onSlow,
        },
      );

      await vi.advanceTimersByTimeAsync(PRODUCT_CLASSIFIER_SLOW_NOTICE_MS + 10);
      expect(onSlow).toHaveBeenCalledOnce();

      // Y la respuesta de verdad sigue llegando después del aviso.
      soltar({
        output: {
          intent: "product.search",
          productType: "lapicero",
          character: null,
          descriptor: "gel",
        },
      });
      await vi.advanceTimersByTimeAsync(10);
      const answer = await pendiente;
      expect(answer?.text).toContain("Lapicero gel");
    } finally {
      vi.useRealTimers();
    }
  });

  it("si contesta rápido no avisa de nada", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.search",
        productType: "lapicero",
        character: null,
        descriptor: null,
      },
    });
    mocks.findMany.mockResolvedValue([
      { id: "p1", name: "Lapicero gel", price: 5500, stock: 3, images: [] },
    ]);
    mocks.count.mockResolvedValue(1);

    const onSlow = vi.fn();
    await answerProductQuestion("store-1", "tienen lapiceros?", { onSlow });
    expect(onSlow).not.toHaveBeenCalled();
  });

  it("si el aviso revienta, la respuesta sale igual", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      let soltar: (v: unknown) => void = () => undefined;
      mocks.generateText.mockReturnValue(
        new Promise((r) => {
          soltar = r;
        }),
      );
      mocks.findMany.mockResolvedValue([
        { id: "p1", name: "Lapicero gel", price: 5500, stock: 3, images: [] },
      ]);
      mocks.count.mockResolvedValue(1);

      // «gel» no es del catálogo: la pregunta pasa por el modelo, que tarda.
      const pendiente = answerProductQuestion("store-1", "tienen lapiceros de gel?", {
        onSlow: () => Promise.reject(new Error("Meta dijo que no")),
      });
      await vi.advanceTimersByTimeAsync(PRODUCT_CLASSIFIER_SLOW_NOTICE_MS + 10);
      soltar({
        output: {
          intent: "product.search",
          productType: "lapicero",
          character: null,
          descriptor: "gel",
        },
      });
      await vi.advanceTimersByTimeAsync(10);

      expect((await pendiente)?.text).toContain("Lapicero gel");
      expect(warn).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      warn.mockRestore();
    }
  });

  it("sin `onSlow` no monta ningún temporizador", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.search",
        productType: "lapicero",
        character: null,
        descriptor: "gel",
      },
    });
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    await expect(
      answerProductQuestion("store-1", "tienen lapiceros?"),
    ).resolves.not.toBeNull();
  });
});

describe("la copia de la lista", () => {
  it("dice «escoge», no «tócame»", () => {
    const body = PRODUCT_TEMPLATES["list.body.few"](3);
    expect(body).toContain("escoge el que quieras");
    expect(body).not.toContain("tócame");
  });

  it("la de «hay más» se queda como estaba", () => {
    expect(PRODUCT_TEMPLATES["list.body.many"](9, 4)).toContain(
      "Toca el que te guste",
    );
  });
});

// ============ Cero resultados: primero el tipo solo, y si no, Paula ============

describe("el fallo del tote bag de perrito (30 de septiembre de 2026)", () => {
  beforeEach(() => vi.clearAllMocks());

  const tote = {
    id: "tote-1",
    name: 'Tote bag "Un día a la Vez"',
    price: 35000,
    stock: 2,
    images: [],
  };

  it("el mensaje real encuentra el producto real, por el diseño", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.price",
        productType: "tote bag",
        character: "perrito",
        descriptor: null,
      },
    });
    mocks.findMany.mockResolvedValue([tote]);
    mocks.count.mockResolvedValue(1);

    const r = await answerProductQuestion(
      "store-1",
      "Que precio tienen los tote bag de perrito",
    );
    expect(r?.text).toBe(
      'Tote bag "Un día a la Vez" está en $35.000 💛 ¿Lo quieres?',
    );
    expect(r?.handoff).toBeFalsy();
    expect(r?.decision).toEqual({
      intent: "product.price",
      slots: {
        productType: "tote bag",
        character: "perrito",
        descriptor: null,
      },
      query: "tote bag perrito",
      total: 1,
      outcome: "match",
    });
    // La consulta que salió a la base mira el diseño con la raíz de la palabra.
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain(
      '"design":{"is":{"name":{"contains":"perrito"}}}',
    );
    expect(mocks.count).toHaveBeenCalledOnce();
  });

  it("si el personaje no existe pero el tipo sí, lo dice y enseña lo que hay", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.search",
        productType: "tote bag",
        character: "dinosaurio",
        descriptor: null,
      },
    });
    const totes = [
      tote,
      {
        id: "tote-2",
        name: 'Tote bag "Caribe"',
        price: 35000,
        stock: 2,
        images: [],
      },
    ];
    // Nombre + etiquetas: 0. Con descripción: 0. Solo el tipo: 2.
    mocks.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(2);
    mocks.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(totes);

    const r = await answerProductQuestion(
      "store-1",
      "¿tienen tote bag de dinosaurio?",
    );
    expect(r?.text).toBe(
      [
        "De dinosaurio no tengo por ahora 💛 Pero de tote bag sí, mira:",
        '• Tote bag "Un día a la Vez" — $35.000',
        '• Tote bag "Caribe" — $35.000',
        "¿Te sirve alguno?",
      ].join("\n"),
    );
    expect(r?.handoff).toBeFalsy();
    expect(r?.shownIds).toEqual(["tote-1", "tote-2"]);
    // La lista tocable no empieza con «Sí»: a lo que pidió, la respuesta es no.
    expect(r?.list?.body).toBe(
      "De dinosaurio no tengo por ahora 💛 Pero de tote bag tengo 2. Míralos y escoge el que quieras.",
    );
    expect(r?.list?.rows).toHaveLength(2);
    expect(r?.decision).toEqual({
      intent: "product.search",
      slots: {
        productType: "tote bag",
        character: "dinosaurio",
        descriptor: null,
      },
      query: "tote bag dinosaurio",
      total: 0,
      retry: { query: "tote bag", total: 2 },
      outcome: "partial",
    });
    // La tercera consulta ya no lleva «dinosaurio».
    const tercera = mocks.findMany.mock.calls[2][0].where;
    expect(tercera.AND).toHaveLength(2);
    expect(JSON.stringify(tercera)).not.toContain("dinosaur");
  });

  it("con uno solo de repuesto, lo ofrece con su precio y su foto", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.price",
        productType: "tote bag",
        character: "dinosaurio",
        descriptor: null,
      },
    });
    mocks.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    mocks.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          ...tote,
          images: [
            { url: "https://res.cloudinary.com/demo/image/upload/v1/tote.jpg" },
          ],
        },
      ]);

    const r = await answerProductQuestion(
      "store-1",
      "¿cuánto vale el tote bag de dinosaurio?",
    );
    expect(r?.text).toBe(
      'De dinosaurio no tengo por ahora 💛 Pero de tote bag tengo Tote bag "Un día a la Vez" en $35.000. ¿Te sirve?',
    );
    expect(r?.photo).toBeTruthy();
    expect(r?.list).toBeUndefined();
    expect(r?.decision?.outcome).toBe("partial");
  });

  it("si ni el tipo aparece, NO dice que no lo tiene: manda el enlace y ofrece a Paula", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.search",
        productType: "mantel",
        character: null,
        descriptor: "de plástico",
      },
    });
    mocks.count.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);

    const r = await answerProductQuestion(
      "store-1",
      "tienes esos manteles de plástico?",
    );
    expect(r?.text).toBe(
      "No encontré mantel de plástico por aquí 💛 Puedes buscarlo en la tienda: https://papeleriapdepapel.com/tienda?search=mantel%20pl%C3%A1stico\n¿Quieres que Paula te ayude?",
    );
    expect(r?.text).not.toMatch(/no lo tengo/i);
    expect(r?.handoff).toBeFalsy();
    expect(r?.noMatchReason).toBe("zero_results");
    expect(r?.shownIds).toBeUndefined();
    expect(r?.list).toBeUndefined();
    expect(r?.decision).toEqual({
      intent: "product.search",
      slots: {
        productType: "mantel",
        character: null,
        descriptor: "de plástico",
      },
      query: "mantel de plástico",
      total: 0,
      retry: { query: "mantel", total: 0 },
      outcome: "unsure",
      reason: "zero_results",
    });
    // Dos pasadas por la consulta entera y dos por el tipo.
    expect(mocks.count).toHaveBeenCalledTimes(4);
  });

  it("si quien llama dice que ya hubo un fallo, vuelve a pasárselo a Paula", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.search",
        productType: "mantel",
        character: null,
        descriptor: "de plástico",
      },
    });
    mocks.count.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);

    const r = await answerProductQuestion("store-1", "tienes esos manteles de plástico?", {
      handoffOnMiss: true,
    });
    expect(r?.text).toBe(PRODUCT_TEMPLATES["search.unsure"]());
    expect(r?.handoff).toBe(true);
    expect(r?.decision?.reason).toBe("zero_results");
  });

  it("sin tipo separado no hay segunda búsqueda: va derecho al enlace", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.search",
        productType: null,
        character: "Kuromi",
        descriptor: "rosado",
      },
    });
    mocks.count.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);

    const r = await answerProductQuestion(
      "store-1",
      "¿tienen algo de Kuromi rosado?",
    );
    expect(r?.handoff).toBeFalsy();
    expect(r?.noMatchReason).toBe("zero_results");
    expect(r?.decision?.retry).toBeUndefined();
    expect(r?.decision?.outcome).toBe("unsure");
    expect(mocks.count).toHaveBeenCalledTimes(2);
  });

  it("si el tipo ya era toda la consulta, tampoco se repite", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.search",
        productType: "tote bag",
        character: null,
        descriptor: null,
      },
    });
    mocks.count.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);

    const r = await answerProductQuestion("store-1", "¿tienen tote bag?");
    expect(r?.handoff).toBeFalsy();
    expect(r?.decision?.retry).toBeUndefined();
    // «tote bag» son dos palabras del catálogo: se busca sin el modelo.
    expect(r?.decision?.source).toBe("catalog");
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.count).toHaveBeenCalledTimes(2);
  });

  it("la disponibilidad y las características también mandan el enlace", async () => {
    for (const intent of [
      "product.availability",
      "product.features",
      "product.photo",
    ]) {
      vi.clearAllMocks();
      mocks.generateText.mockResolvedValue({
        output: {
          intent,
          productType: "mantel",
          character: null,
          descriptor: "de plástico",
        },
      });
      mocks.count.mockResolvedValue(0);
      mocks.findMany.mockResolvedValue([]);
      const r = await answerProductQuestion(
        "store-1",
        "¿queda el mantel de plástico? mándame foto",
      );
      expect(r?.text).toMatch(/^No encontré mantel de plástico por aquí 💛 .*tienda\?search=/);
      expect(r?.handoff).toBeFalsy();
      expect(r?.decision?.intent).toBe(intent);
    }
  });

  it("cuando sí encuentra, la decisión viaja igual y no hay traspaso", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        intent: "product.availability",
        productType: "cartuchera",
        character: "capibara",
        descriptor: null,
      },
    });
    mocks.findMany.mockResolvedValue([
      {
        id: "c1",
        name: "Cartuchera Capibara",
        price: 30000,
        stock: 5,
        images: [],
      },
    ]);
    mocks.count.mockResolvedValue(1);

    const r = await answerProductQuestion(
      "store-1",
      "¿queda cartuchera de capibara?",
    );
    expect(r?.handoff).toBeFalsy();
    expect(r?.decision).toMatchObject({
      query: "cartuchera capibara",
      total: 1,
      outcome: "match",
    });
    // Ni existencias ni ids en lo que se archiva.
    expect(JSON.stringify(r?.decision)).not.toContain("c1");
    expect(JSON.stringify(r?.decision)).not.toContain('"stock"');
  });
});

describe("qué se vuelve a buscar cuando la consulta entera dio cero", () => {
  const base = {
    intent: "product.search" as const,
    productType: null,
    character: null,
    descriptor: null,
  };

  it("el tipo solo, con lo que faltó aparte", () => {
    expect(
      tipoSolo(
        { ...base, productType: "tote bag", character: "perrito" },
        "tote bag perrito",
      ),
    ).toEqual({
      tipo: "tote bag",
      faltante: "perrito",
    });
    expect(
      tipoSolo(
        {
          ...base,
          productType: "cuaderno",
          character: "Kuromi",
          descriptor: "rosado",
        },
        "cuaderno Kuromi rosado",
      ),
    ).toEqual({ tipo: "cuaderno", faltante: "Kuromi rosado" });
  });

  it("aquí el tipo puede ser UNA palabra: el texto dice lo que es", () => {
    const r = tipoSolo(
      { ...base, productType: "cuaderno", character: "Kuromi" },
      "cuaderno Kuromi",
    );
    expect(r?.tipo).toBe("cuaderno");
  });

  it("sin tipo, sin resto, o con el tipo igual a la consulta, no hay nada que repetir", () => {
    expect(
      tipoSolo(
        { ...base, character: "Kuromi", descriptor: "rosado" },
        "Kuromi rosado",
      ),
    ).toBeNull();
    expect(
      tipoSolo({ ...base, productType: "tote bag" }, "tote bag"),
    ).toBeNull();
    expect(
      tipoSolo(
        { ...base, productType: "de la", character: "Kuromi" },
        "Kuromi",
      ),
    ).toBeNull();
  });
});

describe("los textos de lo parcial", () => {
  it("uno, pocos y muchos", () => {
    const uno = {
      matches: [{ name: "Tote bag Caribe", price: 35000 }],
      total: 1,
      hasMore: false,
    };
    expect(renderPartialSearch("perrito", "tote bag", uno)).toBe(
      "De perrito no tengo por ahora 💛 Pero de tote bag tengo Tote bag Caribe en $35.000. ¿Te sirve?",
    );
    const muchos = {
      matches: [
        { name: "A", price: 1000 },
        { name: "B", price: 2000 },
      ],
      total: 5,
      hasMore: true,
    };
    const texto = renderPartialSearch("perrito", "tote bag", muchos);
    expect(texto).toContain("• A — $1.000");
    expect(texto).toContain("…y 3 más");
    expect(buildPartialListBody("perrito", "tote bag", 2, 5)).toContain(
      "me quedan 3 más",
    );
    expect(buildPartialListBody("perrito", "tote bag", 2, 2)).toContain(
      "tengo 2",
    );
  });

  it("el «no lo tengo» plano ya no existe en ninguna plantilla", () => {
    expect(PRODUCT_TEMPLATES).not.toHaveProperty("search.none");
    expect(PRODUCT_TEMPLATES).not.toHaveProperty("availability.none");
    for (const render of Object.values(PRODUCT_TEMPLATES)) {
      const texto = (render as (...args: never[]) => string)(
        "x" as never,
        "y" as never,
        "z" as never,
        1 as never,
      );
      expect(texto).not.toContain("Ay, eso no lo tengo por ahora");
    }
  });

  it("Paula ve el caso parcial y el cauteloso antes de aprobar", () => {
    const labels = previewProductTemplates().map((p) => p.label);
    expect(labels.some((l) => /tote bag de dinosaurio/.test(l))).toBe(true);
    const cauteloso = previewProductTemplates().find((p) =>
      /ningún lado/.test(p.label),
    );
    expect(cauteloso?.text).toBe(PRODUCT_TEMPLATES["search.unsure"]());
  });
});

// ============ «marcadores baratos» (27 de octubre de 2026) ============

const fila = (id: string, name: string, price: number, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  price,
  stock: 3,
  reservedUnits: 0,
  categoryId: "cat",
  productGroupId: null,
  images: [],
  ...extra,
});

describe("lo barato, el tope y una sola palabra del catálogo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCatalogTermCache();
    mocks.typeFindMany.mockResolvedValue([]);
    mocks.categoryFindMany.mockResolvedValue([]);
  });

  it("el portero deja pasar «marcadores baratos» y «resaltadores», no un saludo", async () => {
    expect(looksLikeProductQuestion("marcadores baratos")).toBe(false);
    expect(await looksLikeProductQuestionForStore("store-1", "marcadores baratos")).toBe(true);
    expect(await looksLikeProductQuestionForStore("store-1", "resaltadores")).toBe(true);
    expect(await looksLikeProductQuestionForStore("store-1", "gracias!!")).toBe(false);
    expect(await looksLikeProductQuestionForStore("store-1", "hola buenas")).toBe(false);
  });

  it("también reconoce las categorías de la tienda, leídas de la base", async () => {
    mocks.categoryFindMany.mockResolvedValue([{ name: "🎨 Acuarelas", slug: "acuarelas" }]);
    expect(await looksLikeProductQuestionForStore("store-2", "acuarelas baratas")).toBe(true);
  });

  it("la intención sin modelo: búsqueda, precio y disponibilidad sí; fotos y detalles no", () => {
    const p = (b: string) => parseSearchIntent(b, STATIC_TERM_INDEX);
    expect(intentWithoutModel("marcadores baratos", p("marcadores baratos"))).toBe("product.search");
    expect(intentWithoutModel("cuánto valen los colores", p("cuánto valen los colores"))).toBe("product.price");
    expect(intentWithoutModel("¿quedan resaltadores?", p("¿quedan resaltadores?"))).toBe("product.availability");
    expect(intentWithoutModel("muéstrame fotos de marcadores", p("muéstrame fotos de marcadores"))).toBeNull();
    expect(intentWithoutModel("marcadores de Stitch", p("marcadores de Stitch"))).toBeNull();
    // Con señal de pregunta pasa el portero, pero lo decide el modelo.
    expect(intentWithoutModel("gracias, ¿tienen marcadores?", p("gracias, ¿tienen marcadores?"))).toBeNull();
  });

  it("«marcadores baratos»: sin modelo, solo lo que hay, del más económico al más caro", async () => {
    mocks.findMany.mockResolvedValue([
      fila("m1", "Micropunta negra", 1500),
      fila("m2", "Resaltador pastel", 2500),
      fila("m3", "Marcador doble punta", 4000),
      fila("m4", "Marcador apartado", 1000, { stock: 2, reservedUnits: 2 }),
    ]);
    mocks.count.mockResolvedValue(14);

    const { answer, reason } = await answerProductQuestionDetailed("store-1", "marcadores baratos");

    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(reason).toBeNull();
    const consulta = mocks.findMany.mock.calls[0][0];
    expect(consulta.orderBy).toEqual([{ price: "asc" }, { soldCount: "desc" }]);
    expect(consulta.where.stock).toEqual({ gt: "campo:reservedUnits" });
    expect(consulta.where.price).toBeUndefined();
    // «marcadores» trae también resaltadores y micropuntas.
    const familia = JSON.stringify(consulta.where.AND[0]);
    expect(familia).toContain("resaltador");
    expect(familia).toContain("micropunta");

    expect(answer?.text).toBe(
      "Estos son los más económicos que tengo 💛\n• Micropunta negra — $1.500\n• Resaltador pastel — $2.500\n• Marcador doble punta — $4.000\n…y 11 más. Dime cuál te interesa y te cuento.",
    );
    expect(answer?.text).not.toMatch(/más salen|baratos no tengo/i);
    expect(answer?.shownIds).toEqual(["m1", "m2", "m3"]);
    expect(answer?.shownPrices).toEqual([1500, 2500, 4000]);
    expect(answer?.list?.body).toBe(
      "Estos son los 3 más económicos que tengo 💛 Me quedan 11 más. Toca el que te guste, o dime algo más preciso y te busco mejor.",
    );
    expect(answer?.handoff).toBeFalsy();
    expect(answer?.decision).toMatchObject({
      intent: "product.search",
      query: "marcadores",
      source: "catalog",
      price: { sort: "cheapest", maxPrice: null },
      outcome: "match",
    });
  });

  it("si el modelo mete «barato» en una ranura, se quita: nunca «De baratos no tengo»", async () => {
    mocks.generateText.mockResolvedValue({
      output: { intent: "product.search", productType: "marcador", character: "Stitch", descriptor: "baratos" },
    });
    // Cuatro ceros: la consulta con precio (nombre y descripción) y la misma
    // sin filtro, que dice si es que todo estaba agotado. Luego, el tipo solo.
    for (let i = 0; i < 4; i += 1) {
      mocks.count.mockResolvedValueOnce(0);
      mocks.findMany.mockResolvedValueOnce([]);
    }
    mocks.count.mockResolvedValue(2);
    mocks.findMany.mockResolvedValue([fila("m1", "Micropunta negra", 1500), fila("m3", "Marcador doble punta", 4000)]);

    const r = await answerProductQuestion("store-1", "¿tienen marcadores de Stitch baratos?");

    expect(mocks.generateText).toHaveBeenCalledOnce();
    expect(r?.decision?.query).toBe("marcador Stitch");
    expect(r?.text.startsWith("De Stitch no tengo por ahora 💛 Pero de marcador sí, mira:")).toBe(true);
    expect(r?.text).not.toMatch(/barat/i);
    // La segunda búsqueda, solo por el tipo, también va por precio.
    expect(mocks.findMany.mock.calls[4][0].orderBy).toEqual([{ price: "asc" }, { soldCount: "desc" }]);
  });

  it("una sola palabra del catálogo se contesta; una que no es del catálogo, no", async () => {
    mocks.findMany.mockResolvedValue([fila("r1", "Resaltador pastel", 2500), fila("r2", "Resaltador neón", 3000)]);
    mocks.count.mockResolvedValue(2);
    const si = await answerProductQuestionDetailed("store-1", "resaltadores");
    expect(si.answer?.text).toContain("Resaltador pastel");
    expect(si.reason).toBeNull();

    vi.clearAllMocks();
    mocks.generateText.mockResolvedValue({
      output: { intent: "product.search", productType: "útiles", character: null, descriptor: null },
    });
    const no = await answerProductQuestionDetailed("store-1", "¿tienen útiles?");
    expect(no).toEqual({ answer: null, reason: "few_tokens" });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("«carpeta baja» no es precio: pasa por el modelo y se busca tal cual", async () => {
    mocks.generateText.mockResolvedValue({
      output: { intent: "product.search", productType: "carpeta", character: null, descriptor: "baja" },
    });
    mocks.findMany.mockResolvedValue([fila("c1", "Carpeta baja azul", 9000)]);
    mocks.count.mockResolvedValue(1);
    const r = await answerProductQuestion("store-1", "carpeta baja");
    expect(mocks.generateText).toHaveBeenCalledOnce();
    expect(r?.decision?.query).toBe("carpeta baja");
    expect(r?.decision?.price).toBeUndefined();
    const consulta = mocks.findMany.mock.calls[0][0];
    expect(consulta.orderBy).toEqual([{ soldCount: "desc" }, { createdAt: "desc" }]);
    expect(consulta.where.stock).toBeUndefined();
  });

  it("«cuadernos de menos de 10 mil»: tope en la base y texto con el tope", async () => {
    mocks.findMany.mockResolvedValue([fila("c1", "Libreta mini", 6000), fila("c2", "Cuaderno cosido", 9500)]);
    mocks.count.mockResolvedValue(2);
    const r = await answerProductQuestion("store-1", "cuadernos de menos de 10 mil");
    expect(mocks.findMany.mock.calls[0][0].where.price).toEqual({ lte: 10000 });
    expect(r?.text).toBe("Hasta $10.000 tengo estos 💛\n• Libreta mini — $6.000\n• Cuaderno cosido — $9.500\n¿Cuál te interesa?");
    expect(r?.list?.body).toBe("Hasta $10.000 tengo 2 que te pueden servir 💛 Míralos y escoge el que quieras.");
  });

  it("todo pasa del tope: lo más económico que sí hay, y el motivo es «filtered_out»", async () => {
    mocks.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValue(1);
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValue([fila("c2", "Cuaderno cosido", 9500)]);
    const { answer, reason } = await answerProductQuestionDetailed("store-1", "cuadernos de menos de 2 mil");
    expect(reason).toBe("filtered_out");
    expect(answer?.text).toBe(
      "Hasta $2.000 no tengo por ahora 💛 Lo más económico que tengo es Cuaderno cosido en $9.500. ¿Te sirve?",
    );
    expect(answer?.noMatchReason).toBe("filtered_out");
    expect(answer?.handoff).toBeFalsy();
  });

  it("todo agotado: se dice que se agotó, con el motivo «filtered_out»", async () => {
    mocks.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValue(1);
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValue([fila("m9", "Marcador dorado", 5000, { stock: 0 })]);
    const { answer, reason } = await answerProductQuestionDetailed("store-1", "marcadores baratos");
    expect(reason).toBe("filtered_out");
    expect(answer?.text).toBe(PRODUCT_TEMPLATES["availability.one.no"]("Marcador dorado"));
  });

  it("con precio y una categoría exacta, dos niveles: la categoría primero y la familia después", async () => {
    mocks.categoryFindMany.mockResolvedValue([
      { id: "cat-marc", name: "🖍️ Marcadores", slug: "marcadores", typeId: "t1" },
    ]);
    mocks.findMany.mockImplementation(async ({ where }: { where: { AND: Record<string, unknown>[] } }) => {
      const dentro = JSON.stringify(where.AND.at(-1)) === JSON.stringify({ categoryId: { in: ["cat-marc"] } });
      return dentro
        ? [fila("m2", "Marcador permanente delgado", 2000), fila("m3", "Marcador doble punta", 4000)]
        : [fila("m1", "Micropunta negra", 1500)];
    });
    mocks.count.mockImplementation(async ({ where }: { where: { AND: Record<string, unknown>[] } }) =>
      JSON.stringify(where.AND.at(-1)) === JSON.stringify({ categoryId: { in: ["cat-marc"] } }) ? 2 : 1,
    );

    for (const body of ["marcadores baratos", "plumones económicos"]) {
      resetCatalogTermCache();
      const { answer } = await answerProductQuestionDetailed("store-4", body);
      expect(answer?.shownIds).toEqual(["m2", "m3", "m1"]);
      expect(answer?.decision?.total).toBe(3);
    }
    const condiciones = mocks.findMany.mock.calls.map((c) => JSON.stringify(c[0].where.AND.at(-1)));
    expect(condiciones).toContain(JSON.stringify({ categoryId: { in: ["cat-marc"] } }));
    expect(condiciones).toContain(JSON.stringify({ categoryId: { notIn: ["cat-marc"] } }));
  });

  it("sin precio, la misma categoría exacta no parte en niveles: sigue lo más vendido", async () => {
    mocks.categoryFindMany.mockResolvedValue([
      { id: "cat-marc", name: "Marcadores", slug: "marcadores", typeId: "t1" },
    ]);
    mocks.findMany.mockResolvedValue([fila("m3", "Set de marcadores", 16000)]);
    mocks.count.mockResolvedValue(1);
    await answerProductQuestionDetailed("store-5", "marcadores");
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.findMany.mock.calls[0][0].orderBy).toEqual([{ soldCount: "desc" }, { createdAt: "desc" }]);
  });

  it("cero resultados: un mensaje con la categoría más cercana y su enlace, sin pasar a Paula", async () => {
    mocks.categoryFindMany.mockResolvedValue([{ name: "🖍️ Marcadores", slug: "marcadores" }]);
    mocks.count.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);
    const { answer, reason } = await answerProductQuestionDetailed("store-3", "plumones");
    expect(reason).toBe("zero_results");
    expect(answer?.text).toBe(
      "No encontré plumones por aquí 💛 Mira lo que tengo en Marcadores: https://papeleriapdepapel.com/categoria/marcadores\n¿Quieres que Paula te ayude?",
    );
    expect(answer?.handoff).toBeFalsy();
    expect(answer?.list).toBeUndefined();
    expect(answer?.decision?.reason).toBe("zero_results");
  });

  it("los motivos de no contestar: sin señal, modelo caído y «other»", async () => {
    expect(await answerProductQuestionDetailed("store-1", "hola buenas")).toEqual({ answer: null, reason: "no_signal" });
    expect(mocks.generateText).not.toHaveBeenCalled();

    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.generateText.mockRejectedValue(new Error("You exceeded your current quota"));
    expect(await answerProductQuestionDetailed("store-1", "¿tienen algo de Kuromi?")).toEqual({
      answer: null,
      reason: "classifier_failed",
      detail: "quota",
    });

    mocks.generateText.mockResolvedValue({ output: { intent: "other", productType: null, character: null } });
    expect(await answerProductQuestionDetailed("store-1", "¿tienen envío gratis?")).toEqual({
      answer: null,
      reason: "classifier_other",
    });
  });
});

describe("los textos nuevos, para Paula", () => {
  const tres = {
    matches: [
      { name: "A", price: 1500 },
      { name: "B", price: 2500 },
      { name: "C", price: 4000 },
    ],
    total: 3,
    hasMore: false,
  };

  it("lo barato sin tope y con pocos usa la lista de siempre, que no dice «los que más salen»", () => {
    const t = renderCheapSearch(tres, { sort: "cheapest", maxPrice: null });
    expect(t).toBe(PRODUCT_TEMPLATES["search.few"]("• A — $1.500\n• B — $2.500\n• C — $4.000"));
    expect(buildCheapListBody(3, 3, { sort: "cheapest", maxPrice: null })).toBe(PRODUCT_TEMPLATES["list.body.few"](3));
  });

  it("ningún texto de precio dice «los que más salen»", () => {
    for (const price of [{ sort: "cheapest" as const, maxPrice: null }, { sort: "cheapest" as const, maxPrice: 8000 }]) {
      expect(renderCheapSearch({ ...tres, total: 20, hasMore: true }, price)).not.toMatch(/más salen/);
      expect(buildCheapListBody(3, 20, price)).not.toMatch(/más salen/);
    }
    expect(renderCeilingMiss(1000, tres)).toContain("Hasta $1.000 no tengo por ahora");
  });

  it("cero resultados sin categoría: la búsqueda de la tienda", () => {
    expect(renderNoResults("mantel de plástico", null)).toBe(
      "No encontré mantel de plástico por aquí 💛 Puedes buscarlo en la tienda: https://papeleriapdepapel.com/tienda?search=mantel%20pl%C3%A1stico\n¿Quieres que Paula te ayude?",
    );
  });

  it("Paula ve cada texto nuevo en la vista previa", () => {
    const todo = previewProductTemplates().map((p) => p.text).join("\n");
    for (const fragmento of [
      "Estos son los más económicos que tengo",
      "Hasta $10.000 tengo estos",
      "Hasta $10.000, estos son los más económicos",
      "Hasta $1.000 no tengo por ahora 💛 Lo más económico que tengo es Micropunta",
      "Hasta $1.000 no tengo por ahora 💛 Lo más económico que tengo es:",
      "Hasta $1.000 no tengo por ahora 💛 Estos son los 3",
      "Mira lo que tengo en Marcadores",
      "Puedes buscarlo en la tienda",
      "Estos son los 3 más económicos que tengo",
      "Hasta $10.000 tengo 3 que te pueden servir",
      "Hasta $10.000 tengo varios",
    ]) {
      expect(todo).toContain(fragmento);
    }
  });
});
