import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  messageFindMany: vi.fn(),
  productFindFirst: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    conversationMessage: { findMany: mocks.messageFindMany },
    product: { findFirst: mocks.productFindFirst },
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
    "hola",
    "tienen cuadernos",
    "cuánto vale el cuaderno de stitch",
    "quiero dos cuadernos morados y una cartuchera",
    "gracias",
    "",
    "   ",
  ])("«%s» no señala nada", (texto) => {
    expect(detectProductReference(texto)).toBeNull();
  });

  it.each([
    "necesito 5 cuadernos para el colegio de mi hija",
    "quiero 2 cuadernos",
    "son 2 unidades",
  ])("«%s» cuenta cuántos, no señala cuál", (texto) => {
    expect(detectProductReference(texto)).toBeNull();
  });

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
