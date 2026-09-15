import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  messageFindMany: vi.fn(),
  productFindFirst: vi.fn(),
  productFindMany: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    conversationMessage: { findMany: mocks.messageFindMany },
    product: {
      findFirst: mocks.productFindFirst,
      findMany: mocks.productFindMany,
    },
  },
}));

import { classifyBusinessFact } from "@/lib/whatsapp/bot-facts";
import { matchWhatsAppKeyword } from "@/lib/whatsapp/bot-matching";
import {
  REFERENCE_TTL_MS,
  detectProductReference,
  parseShownProducts,
  resolveProductReference,
} from "@/lib/whatsapp/bot-references";

const AHORA = new Date("2026-09-15T15:00:00Z");
const haceMinutos = (m: number) => new Date(AHORA.getTime() - m * 60_000);

const mensajeCon = (ids: string[], hace: number, intent = "product.search") => ({
  metadata: { shown: { ids, intent } },
  createdAt: haceMinutos(hace),
});

function resolver(reference: Parameters<typeof resolveProductReference>[0]["reference"]) {
  return resolveProductReference({
    conversationId: "c1",
    storeId: "s1",
    reference,
    now: AHORA,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.productFindFirst.mockResolvedValue({ id: "p1" });
});

describe("detectProductReference", () => {
  const ordinales: [string, number][] = [
    ["el primero", 1],
    ["El Primero", 1],
    ["la primera", 1],
    ["la primera opción", 1],
    ["el segundo", 2],
    ["quiero el segundo", 2],
    ["muéstrame el primero", 1],
    ["el primero porfa", 1],
    ["el tercero", 3],
    ["el 1", 1],
    ["el 2", 2],
    ["dame el 2", 2],
    ["número 3", 3],
    ["opción 2", 2],
    ["1", 1],
    ["2", 2],
    ["3", 3],
  ];

  it.each(ordinales)("«%s» señala la posición %i", (texto, posicion) => {
    expect(detectProductReference(texto)).toEqual({ kind: "ordinal", position: posicion });
  });

  it.each(["el último", "la última", "el ultimo"])("«%s» señala el último", (texto) => {
    expect(detectProductReference(texto)).toEqual({ kind: "last" });
  });

  it.each(["ese", "esa", "ese me sirve", "esa opción", "eso", "dame 3 de esos"])(
    "«%s» es un demostrativo",
    (texto) => {
      expect(detectProductReference(texto)).toEqual({ kind: "demonstrative" });
    },
  );

  it.each([
    "cuánto vale el cuaderno de stitch",
    "quiero dos cuadernos morados y una cartuchera",
    "necesito 5 cuadernos para el colegio de mi hija",
    "gracias",
    "",
    "   ",
  ])("«%s» no señala nada", (texto) => {
    expect(detectProductReference(texto)).toBeNull();
  });

  // Desde que se puede nombrar el producto, un mensaje corto cualquiera SÍ
  // sale de aquí como candidato: «hola» son dos palabras y podrían ser el
  // nombre de algo. Quien decide es el resolvedor, comparándolo con lo que de
  // verdad se enseñó, y ahí no encaja con nada. Lo que hay que garantizar no
  // es que esto devuelva `null`, es que la clienta no reciba una respuesta
  // rara: eso se prueba abajo, contra una lista de verdad.
  it.each(["hola", "tienen cuadernos", "quiero 2 cuadernos", "son 2 unidades"])(
    "«%s» sale como candidato, pero no como una posición de la lista",
    (texto) => {
      expect(detectProductReference(texto)).not.toMatchObject({ kind: "ordinal" });
      expect(detectProductReference(texto)).not.toMatchObject({ kind: "last" });
    },
  );

  it.each(["el 2 porfa", "dame el 3 gracias", "2 por favor"])(
    "«%s» sigue señalando aunque lleve cortesía detrás",
    (texto) => {
      expect(detectProductReference(texto)).toMatchObject({ kind: "ordinal" });
    },
  );
});

describe("parseShownProducts", () => {
  it("lee lo guardado", () => {
    expect(parseShownProducts({ shown: { ids: ["a", "b"], intent: "product.price" } })).toEqual({
      ids: ["a", "b"],
      intent: "product.price",
    });
  });

  it.each([
    null,
    undefined,
    {},
    { shown: null },
    { shown: { ids: [], intent: "product.search" } },
    { shown: { ids: ["a"] } },
    { shown: { intent: "product.search" } },
    { cart: { items: 2 } },
  ])("ignora lo que no sirve (%#)", (metadata) => {
    expect(parseShownProducts(metadata)).toBeNull();
  });

  it("descarta los ids que no son cadenas", () => {
    expect(parseShownProducts({ shown: { ids: ["a", 7, null], intent: "product.search" } })).toEqual(
      { ids: ["a"], intent: "product.search" },
    );
  });
});

describe("resolveProductReference", () => {
  it("resuelve «el primero» contra la lista recién enseñada", async () => {
    mocks.messageFindMany.mockResolvedValue([mensajeCon(["p1", "p2", "p3"], 1)]);
    await expect(resolver({ kind: "ordinal", position: 1 })).resolves.toEqual({
      outcome: "resolved",
      productId: "p1",
      intent: "product.search",
    });
  });

  it("resuelve «el segundo»", async () => {
    mocks.messageFindMany.mockResolvedValue([mensajeCon(["p1", "p2", "p3"], 1)]);
    mocks.productFindFirst.mockResolvedValue({ id: "p2" });
    await expect(resolver({ kind: "ordinal", position: 2 })).resolves.toMatchObject({
      outcome: "resolved",
      productId: "p2",
    });
  });

  it("resuelve «el último»", async () => {
    mocks.messageFindMany.mockResolvedValue([mensajeCon(["p1", "p2", "p3"], 1)]);
    mocks.productFindFirst.mockResolvedValue({ id: "p3" });
    await expect(resolver({ kind: "last" })).resolves.toMatchObject({
      outcome: "resolved",
      productId: "p3",
    });
  });

  it("hereda la intención de la lista que se enseñó", async () => {
    mocks.messageFindMany.mockResolvedValue([mensajeCon(["p1"], 1, "product.features")]);
    await expect(resolver({ kind: "ordinal", position: 1 })).resolves.toMatchObject({
      intent: "product.features",
    });
  });

  it("salta los mensajes intermedios sin lista", async () => {
    mocks.messageFindMany.mockResolvedValue([
      { metadata: null, createdAt: haceMinutos(0) },
      { metadata: { cart: {} }, createdAt: haceMinutos(1) },
      mensajeCon(["p1", "p2"], 2),
    ]);
    await expect(resolver({ kind: "ordinal", position: 1 })).resolves.toMatchObject({
      outcome: "resolved",
      productId: "p1",
    });
  });

  it("un acuse por medio no tapa la lista: el aviso de «dame un segundito»", async () => {
    // El aviso de espera se guarda SIN `shown`, así que la búsqueda del último
    // mensaje con lista lo salta, igual que cualquier otro acuse.
    mocks.messageFindMany.mockResolvedValue([
      { metadata: null, createdAt: haceMinutos(0) },
      mensajeCon(["p1", "p2"], 1),
    ]);
    await expect(resolver({ kind: "ordinal", position: 1 })).resolves.toMatchObject({
      outcome: "resolved",
      productId: "p1",
    });
  });

  it("usa la lista MÁS RECIENTE cuando hay dos", async () => {
    mocks.messageFindMany.mockResolvedValue([
      mensajeCon(["nueva1", "nueva2"], 1),
      mensajeCon(["vieja1"], 4),
    ]);
    mocks.productFindFirst.mockResolvedValue({ id: "nueva1" });
    await expect(resolver({ kind: "ordinal", position: 1 })).resolves.toMatchObject({
      productId: "nueva1",
    });
  });

  it("da la lista por perdida pasados los diez minutos", async () => {
    mocks.messageFindMany.mockResolvedValue([mensajeCon(["p1", "p2"], 11)]);
    await expect(resolver({ kind: "ordinal", position: 1 })).resolves.toEqual({ outcome: "lost" });
  });

  it("aguanta justo dentro del plazo", async () => {
    mocks.messageFindMany.mockResolvedValue([
      { metadata: { shown: { ids: ["p1"], intent: "product.search" } },
        createdAt: new Date(AHORA.getTime() - REFERENCE_TTL_MS + 1000) },
    ]);
    await expect(resolver({ kind: "ordinal", position: 1 })).resolves.toMatchObject({
      outcome: "resolved",
    });
  });

  it("da por perdido un número fuera de la lista", async () => {
    mocks.messageFindMany.mockResolvedValue([mensajeCon(["p1", "p2"], 1)]);
    await expect(resolver({ kind: "ordinal", position: 5 })).resolves.toEqual({ outcome: "lost" });
  });

  it("da por perdido el producto que se archivó desde que se enseñó", async () => {
    mocks.messageFindMany.mockResolvedValue([mensajeCon(["p1"], 1)]);
    mocks.productFindFirst.mockResolvedValue(null);
    await expect(resolver({ kind: "ordinal", position: 1 })).resolves.toEqual({ outcome: "lost" });
  });

  it("no dice que perdió el hilo si nunca hubo lista", async () => {
    mocks.messageFindMany.mockResolvedValue([{ metadata: null, createdAt: haceMinutos(1) }]);
    await expect(resolver({ kind: "ordinal", position: 1 })).resolves.toEqual({ outcome: "none" });
  });

  it("resuelve «ese» cuando se enseñó UNO solo", async () => {
    mocks.messageFindMany.mockResolvedValue([mensajeCon(["p1"], 1)]);
    await expect(resolver({ kind: "demonstrative" })).resolves.toMatchObject({
      outcome: "resolved",
      productId: "p1",
    });
  });

  it("no adivina con «ese» si se enseñaron varios", async () => {
    mocks.messageFindMany.mockResolvedValue([mensajeCon(["p1", "p2"], 1)]);
    await expect(resolver({ kind: "demonstrative" })).resolves.toEqual({ outcome: "none" });
  });

  it("tampoco adivina con «ese» y varios aunque la lista haya caducado", async () => {
    mocks.messageFindMany.mockResolvedValue([mensajeCon(["p1", "p2"], 30)]);
    await expect(resolver({ kind: "demonstrative" })).resolves.toEqual({ outcome: "none" });
  });

  it("solo mira los mensajes del bot de esta conversación", async () => {
    mocks.messageFindMany.mockResolvedValue([]);
    await resolver({ kind: "ordinal", position: 1 });
    expect(mocks.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ conversationId: "c1", sentBy: "BOT" }),
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("nunca se fía del precio guardado: vuelve a consultar el producto", async () => {
    mocks.messageFindMany.mockResolvedValue([mensajeCon(["p1"], 1)]);
    await resolver({ kind: "ordinal", position: 1 });
    expect(mocks.productFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1", storeId: "s1", isArchived: false },
      }),
    );
  });
});

describe("no le quita el turno a nadie", () => {
  const señalando = [
    "el primero",
    "la primera",
    "el segundo",
    "el 2",
    "número 3",
    "el último",
    "quiero el segundo",
    "muéstrame el primero",
    "ese",
    "esa opción",
  ];

  // La etapa va DESPUÉS del paso 4 y ANTES del 5, así que estas frases no
  // pueden parecer un dato del negocio ni una palabra clave de las de Paula.
  it.each(señalando)("«%s» no se confunde con un dato del negocio", (texto) => {
    expect(classifyBusinessFact(texto)).toBeNull();
  });

  const palabrasDePaula = [
    { triggers: ["horario", "a que hora"], answer: "Abrimos de 9 a 6." },
    { triggers: ["envio", "domicilio"], answer: "Enviamos a todo el país." },
    { triggers: ["hola", "buenas"], answer: "¡Hola! 💛" },
    { triggers: ["gracias"], answer: "¡Con gusto! 💛" },
  ];

  it.each(señalando)("«%s» no se confunde con una palabra clave", (texto) => {
    expect(matchWhatsAppKeyword(texto, palabrasDePaula)).toBeNull();
  });
});

describe("nombrar el producto en vez de señalarlo", () => {
  const CATALOGO = [
    { id: "p1", name: "Lapicero retráctil semigel 0.7mm pastel" },
    { id: "p2", name: "Caja de Lapiceros Offi-Esco Pocket Gel x4" },
    { id: "p3", name: "Lapiceros acrílicos gel pen x8" },
  ];

  const nombrar = (tokens: string[], hace = 1) => {
    mocks.messageFindMany.mockResolvedValue([mensajeCon(["p1", "p2", "p3"], hace)]);
    return resolveProductReference({
      conversationId: "c1",
      storeId: "s1",
      reference: { kind: "named", tokens },
      now: AHORA,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productFindMany.mockResolvedValue(CATALOGO);
  });

  it("resuelve cuando las palabras encajan con UNO solo", async () => {
    await expect(nombrar(["acrilicos"])).resolves.toEqual({
      outcome: "resolved",
      productId: "p3",
      intent: "product.search",
    });
  });

  it("encaja sin tildes y sin mayúsculas", async () => {
    await expect(nombrar(["caja"])).resolves.toMatchObject({ productId: "p2" });
    await expect(nombrar(["offi-esco"])).resolves.toMatchObject({ productId: "p2" });
  });

  it("pide que estén TODAS las palabras", async () => {
    await expect(nombrar(["caja", "gel"])).resolves.toMatchObject({ productId: "p2" });
    await expect(nombrar(["caja", "acrilicos"])).resolves.toEqual({ outcome: "none" });
  });

  it("sin ningún encaje sigue su camino, no dice que perdió el hilo", async () => {
    await expect(nombrar(["cuaderno"])).resolves.toEqual({ outcome: "none" });
  });

  it("con varios encajes no adivina: misma regla que «ese»", async () => {
    // «lapiceros» está en dos de los tres nombres.
    await expect(nombrar(["lapiceros"])).resolves.toEqual({ outcome: "none" });
  });

  it("solo mira los productos que se enseñaron, nunca el catálogo entero", async () => {
    await nombrar(["acrilicos"]);
    expect(mocks.productFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["p1", "p2", "p3"] },
          storeId: "s1",
          isArchived: false,
        }),
      }),
    );
  });

  it("no ofrece un producto archivado desde que se enseñó", async () => {
    mocks.productFindMany.mockResolvedValue(CATALOGO.filter((p) => p.id !== "p3"));
    await expect(nombrar(["acrilicos"])).resolves.toEqual({ outcome: "none" });
  });

  it.each(["hola", "tienen cuadernos", "quiero 2 cuadernos", "son 2 unidades", "vale gracias"])(
    "«%s» no se contesta contra la lista aunque la haya",
    async (texto) => {
      const senal = detectProductReference(texto);
      if (!senal) return;
      mocks.messageFindMany.mockResolvedValue([mensajeCon(["p1", "p2", "p3"], 1)]);
      await expect(
        resolveProductReference({
          conversationId: "c1",
          storeId: "s1",
          reference: senal,
          now: AHORA,
        }),
      ).resolves.toEqual({ outcome: "none" });
    },
  );

  describe("el reloj se mira DESPUÉS de encajar, no antes", () => {
    it("con encaje único y la lista vencida sí se admite el despiste", async () => {
      await expect(nombrar(["acrilicos"], 30)).resolves.toEqual({ outcome: "lost" });
    });

    it("sin encaje y la lista vencida NO se contesta «se me fue el hilo»", async () => {
      // Esto es lo que protege el cambio de orden: un «vale gracias» suelto
      // horas después de una lista no puede acabar en una disculpa rara.
      await expect(nombrar(["cuaderno"], 30)).resolves.toEqual({ outcome: "none" });
    });

    it("con varios encajes y la lista vencida tampoco", async () => {
      await expect(nombrar(["lapiceros"], 30)).resolves.toEqual({ outcome: "none" });
    });

    it("los ordinales conservan su orden de siempre: primero el reloj", async () => {
      mocks.messageFindMany.mockResolvedValue([mensajeCon(["p1", "p2"], 30)]);
      await expect(resolver({ kind: "ordinal", position: 1 })).resolves.toEqual({
        outcome: "lost",
      });
      // Y no llegó a preguntar por los productos: se cayó antes, como siempre.
      expect(mocks.productFindMany).not.toHaveBeenCalled();
    });
  });
});
