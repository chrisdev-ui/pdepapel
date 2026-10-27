import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { testPrisma } from "./helpers/database";

/**
 * Cerca de, rango, piso, todo el catálogo, regalo, calidad y valor, contra
 * MySQL de verdad. Sin modelo: todos estos mensajes se resuelven solos, y el
 * clasificador doblado falla para probarlo.
 *
 * Datos inventados con la forma del catálogo: marcadores en «Marcadores»,
 * micropuntas y resaltadores en sus categorías, el tipo «Cuadernos», el tipo
 * «Kits», una categoría de regalo y otra de empaques.
 */

const mocks = vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "clave-de-prueba";
  return { generateText: vi.fn() };
});

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => () => "modelo-simulado",
}));

import { PRODUCT_TEMPLATES, answerProductQuestionDetailed, formatCOP } from "@/lib/whatsapp/bot-products";
import { resetCatalogTermCache } from "@/lib/whatsapp/search-intent";
import { resetRecognizedLineCache } from "@/lib/whatsapp/recognized-brands";

const suffix = randomUUID().slice(0, 8);
let storeId = "";
const ids: Record<string, string> = {};

beforeAll(async () => {
  const store = await testPrisma.store.create({ data: { name: `Modos ${suffix}`, userId: `test-user-modos-${suffix}` } });
  storeId = store.id;
  const tipo = (name: string) =>
    testPrisma.type.create({ data: { name, slug: `${name.toLowerCase()}-${suffix}`, storeId } });
  const escritura = await tipo("Escritura");
  const tipoCuadernos = await tipo("Cuadernos");
  const kits = await tipo("Kits");
  let c = 0;
  const categoria = (name: string, typeId: string) => {
    c += 1;
    return testPrisma.category.create({ data: { name, slug: `cat-${suffix}-${c}`, storeId, typeId } });
  };
  const marcadores = await categoria("🖍️ Marcadores", escritura.id);
  const micropuntas = await categoria("Micropuntas", escritura.id);
  const resaltadores = await categoria("Resaltadores", escritura.id);
  const agendas = await categoria("Agendas", escritura.id);
  const cosidos = await categoria("Cosidos", tipoCuadernos.id);
  const kitsEscolares = await categoria("Kits escolares", kits.id);
  const paraRegalar = await categoria("Kits para regalar o regalarse", escritura.id);
  const empaques = await categoria("Empaques para regalo", escritura.id);

  const primavera = await testPrisma.brand.create({
    data: { storeId, name: "Primavera", slug: `primavera-${suffix}`, aliases: [] },
  });
  const flowerPower = await testPrisma.brand.create({
    data: { storeId, name: "Flower Power", slug: `flower-${suffix}`, aliases: [], parentBrandId: primavera.id },
  });

  const design = await testPrisma.design.create({ data: { name: "Clásico", storeId } });
  const color = await testPrisma.color.create({ data: { name: "Negro", value: `#n-${suffix}`.slice(0, 20), storeId } });
  const size = await testPrisma.size.create({ data: { name: "U", value: `u-${suffix}`, storeId } });
  let n = 0;
  const producto = async (
    clave: string,
    name: string,
    categoryId: string,
    price: number,
    extra: { soldCount?: number; isFeatured?: boolean; brandId?: string } = {},
  ) => {
    n += 1;
    const p = await testPrisma.product.create({
      data: {
        name,
        price,
        acqPrice: 500,
        stock: 3,
        slug: `modos-${suffix}-${n}`,
        sku: `MODOS-${suffix}-${n}`,
        description: "<p>Producto de pruebas.</p>",
        storeId,
        categoryId,
        colorId: color.id,
        sizeId: size.id,
        designId: design.id,
        soldCount: extra.soldCount ?? 0,
        isFeatured: extra.isFeatured ?? false,
        brandId: extra.brandId ?? null,
      },
    });
    ids[clave] = p.id;
  };

  await producto("perm", "Marcador permanente delgado", marcadores.id, 2000);
  await producto("normal", "Marcador normal grueso", marcadores.id, 2500);
  await producto("primaveral", "Marcador Primaveral", marcadores.id, 2600);
  await producto("brandField", "Marcador fino", marcadores.id, 3000, { brandId: flowerPower.id });
  await producto("doble", "Marcador doble punta", marcadores.id, 4000, { soldCount: 10 });
  await producto("brandName", "Marcador Norma punta gruesa", marcadores.id, 5000);
  await producto("featured", "Marcador acuarelable", marcadores.id, 9000, { isFeatured: true });
  await producto("set", "Set de marcadores x12", marcadores.id, 16000, { soldCount: 50 });
  await producto("caro", "Marcador profesional x24", marcadores.id, 30000);
  await producto("micro", "Micropunta negra 0.4", micropuntas.id, 1500, { soldCount: 1 });
  await producto("micro2", "Micropunta azul 0.5", micropuntas.id, 1700, { soldCount: 2 });
  await producto("resaltador", "Resaltador pastel", resaltadores.id, 2500);

  await producto("agendaSemanal", "Agenda semanal", agendas.id, 9000);
  await producto("agendaMini", "Agenda mini", agendas.id, 7000);

  await producto("cSold", "Cuaderno cosido rayado", cosidos.id, 6000, { soldCount: 5 });
  await producto("cNone", "Cuaderno cosido liso", cosidos.id, 7000);
  await producto("cNorma", "Cuaderno Norma cosido", cosidos.id, 8000);
  await producto("cFeat", "Cuaderno cosido estrella", cosidos.id, 12000, { isFeatured: true });
  await producto("cCaro", "Cuaderno Norma premium", cosidos.id, 25000, { isFeatured: true });

  await producto("kitEscolar", "Kit escolar básico", kitsEscolares.id, 15000);
  await producto("kitCumple", "Kit de cumpleaños", paraRegalar.id, 18000);
  await producto("kitPremium", "Kit premium", kitsEscolares.id, 35000);
  await producto("bolsa", "Bolsa de regalo", empaques.id, 3000);
});

afterAll(async () => {
  await testPrisma.product.deleteMany({ where: { storeId } });
  await testPrisma.brand.deleteMany({ where: { storeId, parentBrandId: { not: null } } });
  await testPrisma.brand.deleteMany({ where: { storeId } });
  await testPrisma.design.deleteMany({ where: { storeId } });
  await testPrisma.color.deleteMany({ where: { storeId } });
  await testPrisma.size.deleteMany({ where: { storeId } });
  await testPrisma.category.deleteMany({ where: { storeId } });
  await testPrisma.type.deleteMany({ where: { storeId } });
  await testPrisma.store.delete({ where: { id: storeId } });
  await testPrisma.$disconnect();
});

beforeEach(() => {
  mocks.generateText.mockReset();
  mocks.generateText.mockRejectedValue(new Error("el clasificador no debe hacer falta"));
  resetCatalogTermCache();
  resetRecognizedLineCache();
});

const pedir = async (body: string) => {
  const r = await answerProductQuestionDetailed(storeId, body);
  expect(mocks.generateText).not.toHaveBeenCalled();
  return r;
};

describe("cerca de una cifra", () => {
  it("«marcadores como de 3 mil»: lo más cerca de 3.000 primero, en dos niveles", async () => {
    const { answer, reason } = await pedir("marcadores como de 3 mil");
    expect(reason).toBeNull();
    expect(answer?.shownIds).toEqual([ids.brandField, ids.primaveral, ids.normal, ids.resaltador]);
    expect(answer?.decision?.ranking?.every((r) => r.signal === "closest")).toBe(true);
    expect(answer?.text.startsWith("Sí, mira 💛 Tengo estos:")).toBe(true);
  });

  it("nada cerca de 50 mil: lo que hay por debajo, con el texto de tope", async () => {
    const { answer, reason } = await pedir("marcadores como de 50 mil");
    expect(reason).toBe("filtered_out");
    expect(answer?.shownIds?.slice(0, 3)).toEqual([ids.perm, ids.normal, ids.primaveral]);
    expect(answer?.text.startsWith("Hasta $50.000, estos son los más económicos que tengo 💛")).toBe(true);
  });

  it("nada cerca de mil ni por debajo: lo más económico, diciendo que pasa de mil", async () => {
    const { answer, reason } = await pedir("marcadores como de mil pesos");
    expect(reason).toBe("filtered_out");
    expect(answer?.shownIds?.[0]).toBe(ids.perm);
    expect(answer?.text.startsWith("Hasta $1.000 no tengo por ahora 💛 Lo más económico que tengo es:")).toBe(true);
  });
});

describe("rango y piso", () => {
  it("«marcadores entre 2 y 5 mil»: dentro del rango, del más económico al más caro, en dos niveles", async () => {
    const { answer } = await pedir("marcadores entre 2 y 5 mil");
    expect(answer?.shownIds).toEqual([
      ids.perm, ids.normal, ids.primaveral, ids.brandField, ids.doble, ids.brandName, ids.resaltador,
    ]);
    expect(answer?.decision?.price).toMatchObject({ kind: "range", minPrice: 2000, maxPrice: 5000 });
  });

  it("rango sin nada: sin el piso, hasta el máximo, con el texto de tope", async () => {
    const { answer, reason } = await pedir("marcadores entre 40 y 50 mil");
    expect(reason).toBe("filtered_out");
    expect(answer?.text.startsWith("Hasta $50.000, estos son los más económicos que tengo 💛")).toBe(true);
  });

  it("«marcadores desde 10 mil»: de menor a mayor desde 10.000", async () => {
    const { answer } = await pedir("marcadores desde 10 mil");
    expect(answer?.shownIds).toEqual([ids.set, ids.caro]);
  });

  it("«desde 100 mil» no hay: los tres más cercanos por debajo", async () => {
    const { answer, reason } = await pedir("marcadores desde 100 mil");
    expect(reason).toBe("filtered_out");
    expect(answer?.shownIds).toEqual([ids.caro, ids.set, ids.featured]);
    expect(answer?.text).toBe(
      PRODUCT_TEMPLATES["search.floor.none"](
        "$100.000",
        "• Marcador profesional x24 — $30.000\n• Set de marcadores x12 — $16.000\n• Marcador acuarelable — $9.000",
      ),
    );
  });
});

describe("sin palabra de producto", () => {
  it("«algo barato»: todo el catálogo que hay, del más económico", async () => {
    const { answer, reason } = await pedir("algo barato");
    expect(reason).toBeNull();
    expect(answer?.shownIds?.slice(0, 3)).toEqual([ids.micro, ids.micro2, ids.perm]);
    const precios = answer?.shownPrices ?? [];
    expect([...precios].sort((a, b) => a - b)).toEqual(precios);
    expect(answer?.decision?.scope).toBe("all");
  });

  it("«tengo 20 mil para un regalo»: solo Kits y la categoría de regalar, hasta 20.000; nunca empaques", async () => {
    const { answer } = await pedir("tengo 20 mil para un regalo");
    expect(answer?.shownIds).toEqual([ids.kitEscolar, ids.kitCumple]);
    expect(answer?.decision?.scope).toBe("gift");
    expect(answer?.text).not.toContain("Bolsa de regalo");
  });
});

describe("regalo sin precio", () => {
  it("«regalo»: lo de regalo que hay, por lo más vendido; nunca empaques", async () => {
    const { answer } = await pedir("regalo");
    expect(answer?.decision?.scope).toBe("gift");
    expect([...(answer?.shownIds ?? [])].sort()).toEqual([ids.kitEscolar, ids.kitCumple, ids.kitPremium].sort());
    expect(answer?.text).not.toContain("Bolsa de regalo");
    expect(answer?.text.startsWith("Sí, mira 💛 Tengo estos:")).toBe(true);
  });
});

describe("calidad y valor", () => {
  it("«marcadores buenos»: destacado → marca (campo y nombre) → ventas; sin señal, fuera; dos niveles", async () => {
    const { answer } = await pedir("marcadores buenos");
    expect(answer?.shownIds).toEqual([ids.featured, ids.brandName, ids.brandField, ids.set, ids.doble, ids.micro2, ids.micro]);
    expect(answer?.decision?.ranking).toEqual([
      { name: "Marcador acuarelable", signal: "featured", signals: ["featured"] },
      { name: "Marcador Norma punta gruesa", signal: "brand", brandSource: "name", signals: ["brand"] },
      { name: "Marcador fino", signal: "brand", brandSource: "field", signals: ["brand"] },
      { name: "Set de marcadores x12", signal: "sales", signals: ["sales"] },
      { name: "Marcador doble punta", signal: "sales", signals: ["sales"] },
      { name: "Micropunta azul 0.5", signal: "sales", signals: ["sales"] },
      { name: "Micropunta negra 0.4", signal: "sales", signals: ["sales"] },
    ]);
    // «normal» no es «Norma» ni «Primaveral» es «Primavera»: van fuera.
    expect(answer?.shownIds).not.toContain(ids.normal);
    expect(answer?.shownIds).not.toContain(ids.primaveral);
    expect(answer?.shownIds).not.toContain(ids.resaltador);
    expect(
      answer?.text.startsWith(
        "Primero te muestro los que te recomendamos, los de marcas reconocidas y los que más se llevan 💛",
      ),
    ).toBe(true);
    expect(answer?.text).not.toMatch(/mejores|mejor calidad/i);
  });

  it("«marcadores buenos y baratos»: la mitad más económica de cada nivel, con señal, del más económico", async () => {
    const { answer } = await pedir("marcadores buenos y baratos");
    expect(answer?.shownIds).toEqual([ids.brandField, ids.doble, ids.micro, ids.micro2]);
    expect(
      answer?.text.startsWith(
        "Entre los de marcas reconocidas y los que más se llevan, estos son los más económicos 💛",
      ),
    ).toBe(true);
  });

  it("«cuadernos buenos de menos de 20 mil»: el tope filtra, la calidad ordena", async () => {
    const { answer } = await pedir("cuadernos buenos de menos de 20 mil");
    expect(answer?.shownIds).toEqual([ids.cFeat, ids.cNorma, ids.cSold]);
    expect(answer?.shownIds).not.toContain(ids.cCaro);
    expect(answer?.text).toContain("Primero te muestro los que te recomendamos, los de marcas reconocidas y los que más se llevan");
  });

  it("solo con ventas entre los enseñados, el texto no dice «marcas reconocidas»", async () => {
    const { answer } = await pedir("micropuntas buenas");
    expect(answer?.shownIds).toEqual([ids.micro2, ids.micro]);
    expect(answer?.text.startsWith("Primero te muestro los que más se llevan 💛")).toBe(true);
    expect(answer?.text).not.toContain("marcas reconocidas");
  });

  it("«agendas buenas» sin señales: «No tengo cómo decirte cuál es mejor» y lo de siempre", async () => {
    const { answer } = await pedir("agendas buenas");
    expect(answer?.text.startsWith("No tengo cómo decirte cuál es mejor 💛")).toBe(true);
    expect(answer?.decision?.ranking?.every((r) => r.signal === "none")).toBe(true);
  });

  it("«plumones económicos» sigue en dos niveles: los marcadores llenan la página", async () => {
    const { answer } = await pedir("plumones económicos");
    expect(answer?.shownIds).toEqual([
      ids.perm, ids.normal, ids.primaveral, ids.brandField, ids.doble, ids.brandName, ids.featured, ids.set, ids.caro,
    ]);
    expect(answer?.decision?.total).toBe(12);
    expect(answer?.text).toContain(`…y 3 más`);
    expect(formatCOP(answer?.shownPrices?.[0] ?? 0)).toBe("$2.000");
  });
});
