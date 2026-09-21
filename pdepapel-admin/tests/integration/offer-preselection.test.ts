import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadScopeProducts } from "@/lib/offer-scope";
import { parsePreselectedProductIds } from "@/lib/offer-preselection";

import { testPrisma } from "./helpers/database";

/**
 * Los productos que llegan preelegidos en `?productos=` no se comprueban a
 * mano en ningún sitio: la consulta de `loadScopeProducts` está acotada por
 * tienda, así que un id de otra tienda no vuelve. Esta prueba fija eso, porque
 * es toda la garantía que hay entre una dirección escrita a mano y el
 * formulario de ofertas.
 */
describe("productos preelegidos de otra tienda", () => {
  const suffix = randomUUID().slice(0, 8);
  let storeId = "";
  let otherStoreId = "";
  let propio = "";
  let ajeno = "";

  const crearCatalogo = async (nombre: string) => {
    const store = await testPrisma.store.create({
      data: { name: nombre, userId: `owner-${suffix}-${nombre}` },
    });
    const type = await testPrisma.type.create({
      data: { name: "Papelería", slug: `papeleria-${suffix}-${nombre}`, storeId: store.id },
    });
    const category = await testPrisma.category.create({
      data: { name: "Agendas", slug: `agendas-${suffix}-${nombre}`, storeId: store.id, typeId: type.id },
    });
    const size = await testPrisma.size.create({ data: { name: "Único", value: "U", storeId: store.id } });
    const color = await testPrisma.color.create({ data: { name: "Lila", value: "#b9afee", storeId: store.id } });
    const design = await testPrisma.design.create({ data: { name: "Kawaii", storeId: store.id } });
    const product = await testPrisma.product.create({
      data: {
        name: `Agenda de ${nombre}`,
        slug: `agenda-${suffix}-${nombre}`,
        description: "",
        stock: 4,
        price: 20000,
        acqPrice: 9000,
        sku: `AG-${suffix}-${nombre}`,
        storeId: store.id,
        categoryId: category.id,
        sizeId: size.id,
        colorId: color.id,
        designId: design.id,
      },
    });
    return { storeId: store.id, productId: product.id };
  };

  beforeAll(async () => {
    await testPrisma.$connect();
    const propia = await crearCatalogo("propia");
    const ajena = await crearCatalogo("ajena");
    storeId = propia.storeId;
    propio = propia.productId;
    otherStoreId = ajena.storeId;
    ajeno = ajena.productId;
  });

  afterAll(async () => {
    for (const id of [storeId, otherStoreId]) {
      await testPrisma.product.deleteMany({ where: { storeId: id } });
      await testPrisma.category.deleteMany({ where: { storeId: id } });
      await testPrisma.type.deleteMany({ where: { storeId: id } });
      await testPrisma.size.deleteMany({ where: { storeId: id } });
      await testPrisma.color.deleteMany({ where: { storeId: id } });
      await testPrisma.design.deleteMany({ where: { storeId: id } });
      await testPrisma.store.delete({ where: { id } });
    }
    await testPrisma.$disconnect();
  });

  it("deja pasar el producto de la tienda y descarta el de la otra", async () => {
    const ids = parsePreselectedProductIds(`${propio},${ajeno}`);
    expect(ids).toEqual([propio, ajeno]);

    const rows = await loadScopeProducts(testPrisma, storeId, ids, null);

    expect(rows.map((row) => row.id)).toEqual([propio]);
  });

  it("un id inventado no devuelve nada y no revienta", async () => {
    const rows = await loadScopeProducts(
      testPrisma,
      storeId,
      parsePreselectedProductIds(randomUUID()),
      null,
    );
    expect(rows).toEqual([]);
  });

  it("mirado desde la otra tienda, el que se cae es el contrario", async () => {
    const rows = await loadScopeProducts(
      testPrisma,
      otherStoreId,
      parsePreselectedProductIds(`${propio},${ajeno}`),
      null,
    );
    expect(rows.map((row) => row.id)).toEqual([ajeno]);
  });
});
