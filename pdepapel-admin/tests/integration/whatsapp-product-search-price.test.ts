import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { testPrisma } from "./helpers/database";

/**
 * «marcadores baratos», 27 de octubre de 2026, contra MySQL de verdad.
 *
 * La clienta escribió dos palabras sin verbo y el bot contestó «Esa no me la
 * sé». Lo que se prueba aquí es lo que solo la base puede decir: que el filtro
 * de existencias compara `stock` con `reservedUnits`, que el orden por precio
 * sale de la base, que el tope se aplica y que las familias («marcadores»
 * trae micropuntas y resaltadores) encuentran lo que tienen que encontrar.
 *
 * Los datos son inventados con la forma del catálogo: un set de marcadores
 * caro que es el más vendido, y micropuntas baratas que no se llaman
 * «marcador».
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

import { answerProductQuestionDetailed } from "@/lib/whatsapp/bot-products";
import { resetCatalogTermCache } from "@/lib/whatsapp/search-intent";

const suffix = randomUUID().slice(0, 8);
const tiendas: string[] = [];
let storeId = "";
let acuarelasSlug = "";
const ids: Record<string, string> = {};

async function crearTienda(nombre: string) {
  const store = await testPrisma.store.create({
    data: { name: `${nombre} ${suffix}`, userId: `test-user-${nombre}-${suffix}` },
  });
  tiendas.push(store.id);
  const type = await testPrisma.type.create({
    data: { name: "✏️ Escritura", slug: `escritura-${nombre}-${suffix}`, storeId: store.id },
  });
  const tipo = (name: string) =>
    testPrisma.type.create({
      data: { name, slug: `${name.toLowerCase().replace(/[^a-z]+/g, "-")}-${nombre}-${suffix}`, storeId: store.id },
    });
  const categoria = (name: string, typeId: string = type.id) =>
    testPrisma.category.create({
      data: {
        name,
        slug: `${name.toLowerCase().replace(/[^a-z]+/g, "-")}-${nombre}-${suffix}`,
        storeId: store.id,
        typeId,
      },
    });
  const grupo = (name: string) =>
    testPrisma.productGroup.create({ data: { name, description: "Grupo de pruebas", storeId: store.id } });
  const design = await testPrisma.design.create({ data: { name: "Clásico", storeId: store.id } });
  const color = await testPrisma.color.create({
    data: { name: "Negro", value: `#negro-${suffix}`.slice(0, 20), storeId: store.id },
  });
  // El color real «Multicolor» contiene «color»: no debe colarse en «colores».
  const multicolor = await testPrisma.color.create({
    data: { name: "Multicolor", value: `#multi-${suffix}`.slice(0, 20), storeId: store.id },
  });
  const size = await testPrisma.size.create({ data: { name: "U", value: `u-${nombre}-${suffix}`, storeId: store.id } });

  let n = 0;
  const producto = async (
    clave: string,
    name: string,
    cat: { id: string },
    opts: {
      price: number;
      stock?: number;
      reservedUnits?: number;
      soldCount?: number;
      isArchived?: boolean;
      multicolor?: boolean;
      productGroupId?: string;
    },
  ) => {
    n += 1;
    const p = await testPrisma.product.create({
      data: {
        name,
        slug: `p-${nombre}-${suffix}-${n}`,
        description: "<p>Producto de pruebas.</p>",
        stock: opts.stock ?? 3,
        reservedUnits: opts.reservedUnits ?? 0,
        soldCount: opts.soldCount ?? 0,
        isArchived: opts.isArchived ?? false,
        price: opts.price,
        acqPrice: 500,
        sku: `TEST-${nombre}-${suffix}-${n}`,
        storeId: store.id,
        categoryId: cat.id,
        colorId: opts.multicolor ? multicolor.id : color.id,
        sizeId: size.id,
        designId: design.id,
        productGroupId: opts.productGroupId ?? null,
      },
    });
    ids[clave] = p.id;
    return p;
  };
  return { store, tipo, categoria, grupo, producto };
}

async function borrarTienda(id: string) {
  const ofertas = (await testPrisma.offer.findMany({ where: { storeId: id }, select: { id: true } })).map((o) => o.id);
  await testPrisma.offerProduct.deleteMany({ where: { offerId: { in: ofertas } } });
  await testPrisma.offer.deleteMany({ where: { storeId: id } });
  await testPrisma.image.deleteMany({ where: { product: { storeId: id } } });
  await testPrisma.product.deleteMany({ where: { storeId: id } });
  await testPrisma.productGroup.deleteMany({ where: { storeId: id } });
  await testPrisma.design.deleteMany({ where: { storeId: id } });
  await testPrisma.color.deleteMany({ where: { storeId: id } });
  await testPrisma.size.deleteMany({ where: { storeId: id } });
  await testPrisma.category.deleteMany({ where: { storeId: id } });
  await testPrisma.type.deleteMany({ where: { storeId: id } });
  await testPrisma.store.delete({ where: { id } });
}

beforeAll(async () => {
  const t = await crearTienda("precio");
  storeId = t.store.id;
  const marcadores = await t.categoria("🖍️ Marcadores");
  const lapiceros = await t.categoria("Lapiceros");
  // Como en producción: «Cuadernos» es un TIPO con sus categorías, y el
  // foami vive en «Blocks de papel», que el sinónimo «block» alcanzaba.
  const tipoCuadernos = await t.tipo("Cuadernos");
  const cosidos = await t.categoria("Cosidos", tipoCuadernos.id);
  const argollados = await t.categoria("Argollados", tipoCuadernos.id);
  const lettering = await t.categoria("Cuadernos de lettering");
  const oficina = await t.tipo("Oficina");
  const blocks = await t.categoria("Blocks de papel", oficina.id);
  const foami = await t.grupo("Foami x unidad");
  const acuarelas = await t.categoria("🎨 Acuarelas");
  acuarelasSlug = acuarelas.slug;

  await t.producto("set", "Set de marcadores x12", marcadores, { price: 16000, soldCount: 50 });
  await t.producto("doble", "Marcador doble punta", marcadores, { price: 4000, soldCount: 10 });
  // No se llaman «marcador»: llegan por la familia.
  await t.producto("micro", "Micropunta negra 0.4", lapiceros, { price: 1500, soldCount: 1 });
  await t.producto("resaltador", "Resaltador pastel", lapiceros, { price: 2500, soldCount: 2 });
  // Más baratos, pero no se pueden vender.
  await t.producto("agotado", "Marcador metálico", marcadores, { price: 900, stock: 0 });
  await t.producto("apartado", "Marcador neón", marcadores, { price: 1000, stock: 2, reservedUnits: 2 });
  await t.producto("archivado", "Marcador retirado", marcadores, { price: 500, isArchived: true });

  // Lista por encima de todos, pero con una oferta que lo deja en $1.000.
  const promo = await t.producto("promo", "Marcador en promoción", marcadores, { price: 5000 });
  const ahora = Date.now();
  await testPrisma.offer.create({
    data: {
      storeId,
      name: `Promo matriz ${suffix}`,
      type: "PERCENTAGE",
      amount: 80,
      startDate: new Date(ahora - 86_400_000),
      endDate: new Date(ahora + 86_400_000),
      isActive: true,
      products: { create: [{ productId: promo.id }] },
    } as never,
  });

  const colores = await t.categoria("Colores");
  const stickers = await t.categoria("Stickers");
  // Lapiceros cuyo GRUPO dice «de colores»: no son colores para pintar.
  const offi = await t.grupo("Lapicero Offi retráctil de colores ");
  await t.producto("offiFucsia", "Lapicero Offi Fucsia", lapiceros, { price: 2000, productGroupId: offi.id });
  await t.producto("offiLila", "Lapicero Offi Lila", lapiceros, { price: 2000, productGroupId: offi.id });
  await t.producto("foamiRojo", "Foami 1/8 rojo", blocks, { price: 700, productGroupId: foami.id });
  await t.producto("foamiAzul", "Foami 1/8 azul pastel", blocks, { price: 700, productGroupId: foami.id });
  await t.producto("letteringCuaderno", "Libro de práctica lettering", lettering, { price: 12000 });
  // Producción, segunda vuelta: blocks por el sinónimo en el NOMBRE y cosas
  // «de colores» que no son colores para pintar.
  await t.producto("blockOrigami", "Block origami con diseño 15x15cm", blocks, { price: 2500 });
  const sellos = await t.categoria("Sellos");
  // Solo una categoría que EMPIEZA por «agendas»: el nombre sigue contando.
  const agendas2027 = await t.categoria("Agendas 2027");
  await t.producto("planner", "Planner semanal", agendas2027, { price: 15000 });
  await t.producto("agendaSuelta", "Agenda Kuromi", sellos, { price: 9000 });
  await t.producto("almohadillas", "Almohadillas mini para sellos de colores", sellos, { price: 2500 });
  await t.producto("cartulina", "Cartulina 1/8 en colores paquete x 10", blocks, { price: 4500 });
  await t.producto("lapicesColores", "Lápices de colores x12", colores, { price: 8000, soldCount: 20 });
  await t.producto("triangulares", "Colores triangulares x6", colores, { price: 5000 });
  await t.producto("stickers", "Stickers surtidos", stickers, { price: 800, multicolor: true });

  await t.producto("cosido", "Cuaderno cosido", cosidos, { price: 9500, soldCount: 5 });
  // En el tipo, aunque el nombre no diga «cuaderno».
  await t.producto("mini", "Libreta mini", cosidos, { price: 6000, soldCount: 1 });
  await t.producto("grande", "Cuaderno argollado grande", argollados, { price: 18000, soldCount: 30 });

  const otra = await crearTienda("ajena");
  const otraCat = await otra.categoria("Marcadores");
  await otra.producto("ajeno", "Marcador ajeno", otraCat, { price: 100 });
});

afterAll(async () => {
  for (const id of tiendas) await borrarTienda(id);
  await testPrisma.$disconnect();
});

beforeEach(() => {
  mocks.generateText.mockReset();
  resetCatalogTermCache();
});

describe("lo barato primero, y solo lo que hay", () => {
  it("«marcadores baratos»: la oferta, micropuntas y resaltadores primero, sin modelo y sin agotados", async () => {
    const { answer, reason } = await answerProductQuestionDetailed(storeId, "marcadores baratos");

    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(reason).toBeNull();
    // El de la oferta va primero por lo que de verdad se cobra, no por la lista.
    expect(answer?.shownIds).toEqual([ids.promo, ids.micro, ids.resaltador, ids.doble, ids.set]);
    expect(answer?.shownPrices).toEqual([1000, 1500, 2500, 4000, 16000]);
    expect(answer?.text).toBe(
      "Sí, mira 💛 Tengo estos:\n• Marcador en promoción — $1.000\n• Micropunta negra 0.4 — $1.500\n• Resaltador pastel — $2.500\n• Marcador doble punta — $4.000\n• Set de marcadores x12 — $16.000\n¿Cuál te interesa?",
    );
    expect(answer?.text).not.toMatch(/más salen|baratos no tengo|Ajeno|metálico|neón|retirado/i);
    expect(answer?.handoff).toBeFalsy();
  });

  it("«marcadores» sin precio sigue por lo más vendido", async () => {
    const { answer } = await answerProductQuestionDetailed(storeId, "marcadores");
    expect(answer?.shownIds?.[0]).toBe(ids.set);
    // Sin precio no se filtra por existencias: el agotado sale (y se ve agotado al preguntar si queda).
    expect(answer?.shownIds).toContain(ids.agotado);
    expect(answer?.shownIds).not.toContain(ids.archivado);
  });

  it("«cuadernos de menos de 10 mil»: solo cuadernos, nunca el foami de «Blocks de papel»", async () => {
    const { answer } = await answerProductQuestionDetailed(storeId, "cuadernos de menos de 10 mil");
    expect(answer?.shownIds).toEqual([ids.mini, ids.cosido]);
    expect(answer?.shownIds).not.toContain(ids.foamiRojo);
    expect(answer?.shownIds).not.toContain(ids.blockOrigami);
    expect(answer?.text.startsWith("Hasta $10.000 tengo estos 💛")).toBe(true);
  });

  it("todo pasa del tope: lo más económico que sí hay, con «filtered_out»", async () => {
    const { answer, reason } = await answerProductQuestionDetailed(storeId, "cuadernos de menos de 2 mil");
    expect(reason).toBe("filtered_out");
    expect(answer?.shownIds?.[0]).toBe(ids.mini);
    expect(answer?.text.startsWith("Hasta $2.000 no tengo por ahora 💛 Lo más económico que tengo es:")).toBe(true);
  });

  it("el tope se aplica al precio de lista: la oferta que baja de él no entra (aceptado)", async () => {
    const { answer } = await answerProductQuestionDetailed(storeId, "marcadores de menos de 3 mil");
    expect(answer?.shownIds).toEqual([ids.micro, ids.resaltador]);
  });

  it("«colores baratos»: la categoría «Colores», ni Multicolor, ni el grupo «Lapicero … de colores», ni nombres «de colores»", async () => {
    const { answer } = await answerProductQuestionDetailed(storeId, "colores baratos");
    expect(answer?.shownIds).toEqual([ids.triangulares, ids.lapicesColores]);
    expect(answer?.shownIds).not.toContain(ids.almohadillas);
    expect(answer?.shownIds).not.toContain(ids.cartulina);
  });

  it("sin igualdad exacta (solo «Agendas 2027»), la categoría se suma a lo de siempre en el nombre", async () => {
    const { answer } = await answerProductQuestionDetailed(storeId, "agendas baratas");
    expect(answer?.shownIds).toEqual([ids.agendaSuelta, ids.planner]);
  });

  it("«cuadernos» a secas trae el tipo y la categoría que empieza por «Cuadernos»", async () => {
    const { answer } = await answerProductQuestionDetailed(storeId, "cuadernos baratos");
    expect(answer?.shownIds).toEqual([ids.mini, ids.cosido, ids.letteringCuaderno, ids.grande]);
  });

  it("una sola palabra del catálogo: «resaltadores»", async () => {
    const { answer, reason } = await answerProductQuestionDetailed(storeId, "resaltadores");
    expect(reason).toBeNull();
    expect(answer?.text).toBe("Sí 💛 Tengo Resaltador pastel en $2.500. ¿Lo quieres?");
  });
});

describe("cuando no hay nada", () => {
  it("una categoría de la tienda sin productos: el enlace a esa categoría, sin pasar a Paula", async () => {
    const { answer, reason } = await answerProductQuestionDetailed(storeId, "acuarelas");
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(reason).toBe("zero_results");
    expect(answer?.text).toBe(
      `No encontré acuarelas por aquí 💛 Mira lo que tengo en Acuarelas: https://papeleriapdepapel.com/categoria/${acuarelasSlug}\n¿Quieres que Paula te ayude?`,
    );
    expect(answer?.handoff).toBeFalsy();
  });

  it("nada parecido en el catálogo: el enlace a la búsqueda de la tienda", async () => {
    mocks.generateText.mockResolvedValue({
      output: { intent: "product.search", productType: "mantel", character: null, descriptor: "de plástico" },
      usage: undefined,
    });
    const { answer, reason } = await answerProductQuestionDetailed(storeId, "¿tienen manteles de plástico?");
    expect(reason).toBe("zero_results");
    expect(answer?.text).toBe(
      "No encontré mantel de plástico por aquí 💛 Puedes buscarlo en la tienda: https://papeleriapdepapel.com/tienda?search=mantel%20pl%C3%A1stico\n¿Quieres que Paula te ayude?",
    );
    expect(answer?.handoff).toBeFalsy();
  });
});
