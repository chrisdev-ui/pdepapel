import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    product: {
      findMany: mocks.findMany,
      count: mocks.count,
      findFirst: mocks.findFirst,
    },
  },
}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => () => "modelo-simulado",
}));
vi.mock("@/lib/env.mjs", () => ({ env: { GEMINI_API_KEY: "clave-de-prueba" } }));

import {
  MIN_USEFUL_DESCRIPTION_LENGTH,
  PHOTO_WIDTH,
  PRODUCT_TEMPLATES_VERSION,
  answerProductQuestion,
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
  resolveAvailability,
  resolveProductFeatures,
  resolveProductPrice,
  answerAboutProduct,
  resolveProductSearch,
  trimForWhatsApp,
} from "@/lib/whatsapp/bot-products";
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
    expect(searchTokens("agenda de Hello Kitty")).toEqual(["agenda", "hello", "kitty"]);
    // «de» y las palabras de dos letras se caen: aparecen dentro de todo.
    expect(searchTokens("algo de la")).toEqual([]);
  });

  it("exige TODAS las palabras, cada una con sus sinónimos", () => {
    const where = productTokenSearchWhere("cuaderno de Stitch");
    expect(where).toHaveLength(2);
    // Primera palabra: cuaderno y sus sinónimos, o en la descripción.
    const nombres = where[0].OR!.map((c: any) => c.name?.contains).filter(Boolean);
    expect(nombres).toContain("cuaderno");
    expect(nombres).toContain("libreta");
    expect(where[0].OR).toContainEqual({ description: { contains: "cuaderno" } });
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
      "cuaderno de Stitch", "agenda de Hello Kitty", "lapicero de Kuromi",
      "cartuchera de Capibara", "sticker de Snoopy", "llavero de Stitch",
      "cuaderno de Harry Potter", "mug de Hello Kitty", "borrador de Kuromi",
      "termo de Capibara",
    ]) {
      expect(productTokenSearchWhere(q).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("el portero que ahorra cuota", () => {
  it("deja pasar lo que suena a pregunta de producto", () => {
    for (const q of [
      "¿tienen algo de Kuromi?", "queda cartuchera de capibara?",
      "busco un cuaderno", "manejan stickers?", "hay agendas disponibles?",
    ]) {
      expect(looksLikeProductQuestion(q)).toBe(true);
    }
  });

  it("no gasta una llamada en un saludo", () => {
    expect(looksLikeProductQuestion("gracias!!")).toBe(false);
    expect(looksLikeProductQuestion("hola buenas")).toBe(false);
  });
});

describe("resolvedores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve hasta tres y avisa si hay más", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "1", name: "Cuaderno Stitch", price: 18000, stock: 4 },
      { id: "2", name: "Libreta Stitch", price: 12000, stock: 0 },
      { id: "3", name: "Llavero Stitch", price: 9000, stock: 2 },
    ]);
    mocks.count.mockResolvedValue(6);

    const fact = await resolveProductSearch("store-1", clasificacion);
    expect(fact.known).toBe(true);
    if (!fact.known) return;
    expect(fact.value.matches).toHaveLength(3);
    expect(fact.value.total).toBe(6);
    expect(fact.value.hasMore).toBe(true);
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
    // Lo de siempre, más la foto; nada más. `stock` entra aquí y sale booleano.
    expect(Object.keys(args.select).sort()).toEqual([
      "id", "images", "name", "price", "stock",
    ]);
    expect(args.select.images).toEqual({
      where: { brokenAt: null },
      orderBy: { isMain: "desc" },
      select: { url: true },
      take: 1,
    });
    expect(args.where.isArchived).toBe(false);
    expect(args.orderBy).toEqual([{ soldCount: "desc" }, { createdAt: "desc" }]);
    expect(args.take).toBe(3);
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
  const search = (matches: { name: string; price: number }[], total: number) => ({
    matches,
    total,
    hasMore: total > matches.length,
  });

  it("uno solo: contesta derecho", () => {
    const texto = renderProductSearch(search([{ name: "Cuaderno Stitch", price: 18000 }], 1));
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

  it("ninguno: contesta que no, sin escalar", () => {
    const texto = renderProductSearch(search([], 0));
    expect(texto).toBe("Ay, eso no lo tengo por ahora 💛 Te aviso apenas llegue.");
  });

  it("al decir que no, no se vuelve a preguntar qué buscaba", () => {
    // Ya lo dijo en su mensaje; volver a preguntarlo se lee a formulario.
    // Son dos textos distintos (búsqueda y disponibilidad), y los dos tenían
    // la misma repetición, así que los dos se arreglaron.
    const sinNada = { matches: [], total: 0, hasMore: false };
    for (const texto of [
      renderProductSearch(sinNada),
      renderProductPrice(sinNada),
      renderProductFeatures(sinNada),
      renderAvailability({ matches: [], total: 0, hasMore: false }),
    ]) {
      expect(texto).not.toMatch(/buscabas/i);
      expect(texto).toBe("Ay, eso no lo tengo por ahora 💛 Te aviso apenas llegue.");
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
      output: { intent: "product.search", productType: "cuaderno", character: "Stitch", descriptor: null },
    });
    const r = await classifyProductQuestion("¿tienen cuadernos de Stitch?");
    expect(r).toEqual({
      ok: true,
      value: { intent: "product.search", productType: "cuaderno", character: "Stitch", descriptor: null },
    });
  });

  it("pide una sola llamada y corta a los 2,5 s", async () => {
    mocks.generateText.mockResolvedValue({
      output: { intent: "other", productType: null, character: null },
    });
    await classifyProductQuestion("hola");
    const args = mocks.generateText.mock.calls[0][0];
    // Reintentar dentro de la ventana no sirve y gasta cuota.
    expect(args.maxRetries).toBe(0);
    expect(args.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("CUOTA AGOTADA: el error real de Gemini se reconoce como tal", async () => {
    // Textual del error capturado en producción contra la llave gratuita.
    mocks.generateText.mockRejectedValue(
      new Error(
        "Failed after 3 attempts. Last error: AI_APICallError: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits",
      ),
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
      output: { intent: "product.search", productType: "cuaderno", character: "Stitch", descriptor: null },
    });
    mocks.findMany.mockResolvedValue([
      { id: "1", name: "Cuaderno Stitch", price: 18000, stock: 3 },
    ]);
    mocks.count.mockResolvedValue(1);

    const r = await answerProductQuestion("store-1", "¿tienen cuadernos de Stitch?");
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

    const r = await answerProductQuestion("store-1", "¿queda cartuchera de capibara?");
    expect(r?.intent).toBe("product.availability");
    expect(r?.text).toMatch(/disponible/i);
    expect(r?.text).not.toContain("5");
  });

  it("con la cuota agotada no contesta nada y deja seguir", async () => {
    mocks.generateText.mockRejectedValue(new Error("You exceeded your current quota"));
    expect(await answerProductQuestion("store-1", "¿tienen algo de Kuromi?")).toBeNull();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("«other» no se contesta aquí", async () => {
    mocks.generateText.mockResolvedValue({
      output: { intent: "other", productType: null, character: null },
    });
    expect(await answerProductQuestion("store-1", "¿tienen envío gratis?")).toBeNull();
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
    expect(areProductAnswersApproved({ ...base, botProductsApprovedAt: null })).toBe(false);
    expect(areProductAnswersApproved({ ...base, botProductsVersion: "vieja" })).toBe(false);
  });

  it("la consulta se arma con las dos ranuras", () => {
    expect(buildSearchQuery(clasificacion)).toBe("cuaderno Stitch");
    expect(
      buildSearchQuery({ intent: "product.search", productType: null, character: "Kuromi", descriptor: null }),
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
    expect(cleanDescription("<p>tinta &amp; papel&nbsp;fino</p>")).toBe("tinta & papel fino");
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
    const fact = await resolveProductPrice("store-1", { ...clasificacion, intent: "product.price" });
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

  it("ninguno: lo mismo que la búsqueda, sin escalar", () => {
    expect(renderProductPrice({ matches: [], total: 0, hasMore: false })).toMatch(/no lo tengo/i);
  });
});

describe("características", () => {
  beforeEach(() => vi.clearAllMocks());

  const unSoloCon = (description: string) => {
    mocks.findMany.mockResolvedValue([
      { id: "1", name: "Portacarnet Doraemon", price: 15000, stock: 2, description },
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
    await resolveProductFeatures("store-1", { ...clasificacion, intent: "product.features" });
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
      await resolveProductFeatures("store-1", { ...clasificacion, intent: "product.features" }),
    ).toEqual({ known: false });
  });

  it("DESCRIPCIÓN CORTA PERO NO VACÍA: también se escala", async () => {
    // Caso distinto del vacío a propósito: «Borrador rosado.» es texto real,
    // pero contarlo como respuesta se lee peor que pasárselo a Paula.
    const corta = "<p>Borrador rosado.</p>";
    expect(cleanDescription(corta).length).toBeLessThan(MIN_USEFUL_DESCRIPTION_LENGTH);
    unSoloCon(corta);
    expect(
      await resolveProductFeatures("store-1", { ...clasificacion, intent: "product.features" }),
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
      { id: "1", name: "Cuaderno Stitch", price: 18000, stock: 1, description: DESCRIPCION_REAL },
      { id: "2", name: "Libreta Stitch", price: 12000, stock: 1, description: DESCRIPCION_REAL },
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
      output: { intent: "product.price", productType: "cuaderno", character: "Stitch" },
    });
    mocks.findMany.mockResolvedValue([
      { id: "1", name: "Cuaderno Stitch", price: 18000, stock: 3 },
    ]);
    mocks.count.mockResolvedValue(1);
    const r = await answerProductQuestion("store-1", "cuánto cuesta el cuaderno de Stitch");
    expect(r?.intent).toBe("product.price");
    expect(r?.text).toContain("$18.000");
  });

  it("características", async () => {
    mocks.generateText.mockResolvedValue({
      output: { intent: "product.features", productType: "portacarnet", character: "Doraemon" },
    });
    mocks.findMany.mockResolvedValue([
      { id: "1", name: "Portacarnet Doraemon", price: 15000, stock: 2, description: DESCRIPCION_REAL },
    ]);
    mocks.count.mockResolvedValue(1);
    const r = await answerProductQuestion("store-1", "de qué material es el portacarnet de Doraemon?");
    expect(r?.intent).toBe("product.features");
    expect(r?.text).not.toMatch(/<[^>]+>/);
  });

  it("características con descripción pobre no contesta: deja seguir", async () => {
    mocks.generateText.mockResolvedValue({
      output: { intent: "product.features", productType: "borrador", character: null },
    });
    mocks.findMany.mockResolvedValue([
      { id: "1", name: "Borrador", price: 2000, stock: 9, description: "<p>Rosado.</p>" },
    ]);
    mocks.count.mockResolvedValue(1);
    expect(await answerProductQuestion("store-1", "cómo es el borrador?")).toBeNull();
  });

  it.each([
    ["cuota", new Error("You exceeded your current quota, please check your plan")],
    ["tiempo", Object.assign(new Error("operation was aborted due to timeout"), { name: "TimeoutError" })],
    ["transporte", new Error("socket hang up")],
  ])("precio y características también se caen bien si el modelo falla por %s", async (_motivo, error) => {
    mocks.generateText.mockRejectedValue(error);
    expect(await answerProductQuestion("store-1", "cuánto cuesta el cuaderno de Stitch")).toBeNull();
    expect(await answerProductQuestion("store-1", "de qué material es la agenda?")).toBeNull();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("una respuesta con una intención inventada no se cuela como precio", async () => {
    mocks.generateText.mockResolvedValue({
      output: { intent: "product.cost", productType: "cuaderno", character: null },
    });
    expect(await answerProductQuestion("store-1", "cuánto cuesta el cuaderno")).toBeNull();
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
    expect(pickPhoto([{ url: FOTO_CRUDA }])).toContain("f_auto,q_auto,c_limit,w_1600");
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

  const unSolo = (images: { url: string }[], extra: Record<string, unknown> = {}) => {
    mocks.findMany.mockResolvedValue([
      { id: "1", name: "Separador Harry", price: 9000, stock: 4, images, ...extra },
    ]);
    mocks.count.mockResolvedValue(1);
  };

  it("búsqueda, disponibilidad y precio la llevan", async () => {
    for (const resolver of [resolveProductSearch, resolveAvailability, resolveProductPrice]) {
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
      { id: "1", name: "A", price: 1000, stock: 1, images: [{ url: FOTO_CRUDA }] },
      { id: "2", name: "B", price: 2000, stock: 1, images: [{ url: FOTO_CRUDA }] },
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

  it("ninguno: el «no lo tengo» de siempre", () => {
    expect(renderProductPhoto({ matches: [], total: 0, hasMore: false, photo: null })).toBe(
      "Ay, eso no lo tengo por ahora 💛 Te aviso apenas llegue.",
    );
  });

  it("de la pregunta al mensaje con foto", async () => {
    mocks.generateText.mockResolvedValue({
      output: { intent: "product.photo", productType: "separador", character: "Harry" },
    });
    mocks.findMany.mockResolvedValue([
      { id: "1", name: "Separador Harry", price: 9000, stock: 4, images: [{ url: FOTO_CRUDA }] },
    ]);
    mocks.count.mockResolvedValue(1);
    const r = await answerProductQuestion("store-1", "mándame una foto del separador de Harry");
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
    expect(fallbackQueryFromMessage("Muéstrame el morado pastel")).toBe("morado pastel");
    expect(fallbackQueryFromMessage("¿Tienes el cuaderno azul?")).toBe("cuaderno azul");
    expect(fallbackQueryFromMessage("hola, quiero un llavero porfa")).toBe("llavero");
  });

  it("si no queda nada útil, devuelve vacío y se escala", () => {
    expect(fallbackQueryFromMessage("muéstrame el")).toBe("");
    expect(fallbackQueryFromMessage("hola gracias")).toBe("");
    expect(fallbackQueryFromMessage("")).toBe("");
  });

  it("se usa cuando las tres ranuras vienen vacías", async () => {
    mocks.generateText.mockResolvedValue({
      output: { intent: "product.photo", productType: null, character: null, descriptor: null },
    });
    mocks.findMany.mockResolvedValue([
      { id: "1", name: "Cuadernos Stitch Morado pastel", price: 13000, stock: 4, images: [] },
    ]);
    mocks.count.mockResolvedValue(1);

    const r = await answerProductQuestion("store-1", "Muéstrame el morado pastel");
    expect(r).not.toBeNull();
    expect(r?.text).toContain("Cuadernos Stitch Morado pastel");
    // Buscó «morado pastel», no la frase entera ni una cadena vacía.
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(2);
  });

  it("si ni la red encuentra palabras, no se contesta y sigue el camino", async () => {
    mocks.generateText.mockResolvedValue({
      output: { intent: "product.search", productType: null, character: null, descriptor: null },
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

  it("la búsqueda por nombre no mira la descripción", () => {
    const where = productNameTokenSearchWhere("borrador morado");
    expect(where).toHaveLength(2);
    for (const clausula of where) {
      const claves = clausula.OR!.map((c: any) => Object.keys(c)[0]);
      expect(claves.every((k) => k === "name")).toBe(true);
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
      { id: "1", name: "Borrador Morado fluorescente", price: 1800, stock: 9, images: [] },
    ]);
    mocks.count.mockResolvedValue(1);

    const fact = await resolveProductSearch("store-1", {
      intent: "product.search", productType: "borrador", character: null, descriptor: "morado",
    });
    expect(fact.known && fact.value.total).toBe(1);
    // Una sola pasada.
    expect(mocks.count).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.findMany.mock.calls[0][0].where)).not.toContain("description");
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
      intent: "product.search", productType: "agenda", character: null, descriptor: "grande",
    });
    expect(fact.known && fact.value.total).toBe(2);
    // Dos pasadas: la segunda ya mira la descripción.
    expect(mocks.count).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(mocks.findMany.mock.calls[0][0].where)).not.toContain("description");
    expect(JSON.stringify(mocks.findMany.mock.calls[1][0].where)).toContain("description");
  });

  it("si no hay nada por ningún lado, se responde que no se tiene", async () => {
    mocks.count.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);
    const fact = await resolveProductSearch("store-1", {
      intent: "product.search", productType: "termo", character: null, descriptor: "de acero",
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
          { id: "1", name: "Cuadernos Stitch Morado pastel", price: 13000, stock: 4, images: [] },
        ]);
        mocks.count.mockResolvedValue(1);
        const fact = await resolveProductSearch("store-1", {
          intent: "product.photo", productType, character: null, descriptor,
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
      { id: "clave-secreta-123", name: "Cuaderno Stitch", price: 18000, stock: 4, images: [] },
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
    const answer = await answerAboutProduct("store-1", "p1", "product.availability");
    expect(answer?.text).toContain("se me agotó");
    // Y el número no sale nunca.
    expect(answer?.text).not.toContain("0");
  });

  it("no inventa nada si el producto ya no está", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(answerAboutProduct("store-1", "p1", "product.search")).resolves.toBeNull();
  });

  it("no cuenta cómo es si la descripción no da para nada", async () => {
    mocks.findFirst.mockResolvedValue({ ...producto, description: "<p>Lindo</p>" });
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
    const answer = await answerAboutProduct("store-1", "p1", "product.features");
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
      images: [{ url: "https://res.cloudinary.com/demo/image/upload/v1/foto.jpg" }],
    });
    const answer = await answerAboutProduct("store-1", "p1", "product.photo");
    expect(answer?.photo).toContain("foto.jpg");
  });
});
