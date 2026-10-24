import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LOW_MARGIN_PAGE_SIZE, loadLowMargin, parseLowMarginQuery } from "@/lib/low-margin-list";
import type { ActiveOffer } from "@/lib/offer-pricing";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * «Margen bajo» contra MySQL: cada clase cae en su sección con el mínimo de la
 * tienda, la oferta vigente cuenta como precio de hoy, el kit se mide con el
 * costo de sus piezas, los archivados y los de otra tienda no entran, y las
 * páginas no repiten ni pierden.
 */
let fixture: InventoryFixture | undefined;
let otherStoreId = "";
let ids: Record<string, string> = {};
let createdIds: string[] = [];

const EXTRA_BELOW_MINIMUM = 55;

beforeAll(async () => {
  await testPrisma.$connect();
  fixture = await createInventoryFixture();
  const store = fixture.store.id;
  await testPrisma.store.update({ where: { id: store }, data: { storeMinMarginPercent: 40 } });
  const suffix = randomUUID().slice(0, 8);
  const base = {
    storeId: store,
    categoryId: fixture.category.id,
    sizeId: fixture.component.sizeId,
    colorId: fixture.component.colorId,
    designId: fixture.component.designId,
    description: "Producto de pruebas",
    stock: 10,
    acqPrice: 6_000,
  };
  const named = [
    { key: "cumple", price: 20_000 },
    { key: "soloBold", price: 10_000 },
    { key: "bajoMinimo", price: 9_000 },
    { key: "bajoCosto", price: 5_000 },
    { key: "ofertaBajoCosto", price: 8_000 },
    { key: "sinCosto", price: 10_000, acqPrice: 0 },
    { key: "archivado", price: 1_000, isArchived: true },
  ];
  const rows = [
    ...named.map(({ key, ...rest }) => ({ ...base, ...rest, name: `MB ${key}`, slug: `mb-${key}-${suffix}`, sku: `MB-${suffix}-${key}` })),
    ...Array.from({ length: EXTRA_BELOW_MINIMUM }, (_, i) => ({ ...base, price: 8_500 + i, name: `MB extra ${i}`, slug: `mb-extra-${suffix}-${i}`, sku: `MB-${suffix}-x${i}` })),
  ];
  await testPrisma.product.createMany({ data: rows as never });
  const created = await testPrisma.product.findMany({ where: { storeId: store, sku: { startsWith: `MB-${suffix}` } }, select: { id: true, name: true } });
  createdIds = created.map((row) => row.id);
  ids = Object.fromEntries(created.map((row) => [row.name.replace("MB ", ""), row.id]));

  const other = await testPrisma.store.create({ data: { name: `Otra ${suffix}`, userId: `otra-${suffix}`, storeMinMarginPercent: 40 } as never });
  otherStoreId = other.id;
  await testPrisma.product.create({ data: { ...base, storeId: otherStoreId, price: 1_000, name: "MB otra tienda", slug: `mb-otra-${suffix}`, sku: `MBO-${suffix}` } as never });
});

afterAll(async () => {
  if (fixture) {
    await testPrisma.product.deleteMany({ where: { id: { in: createdIds } } });
    await testPrisma.product.deleteMany({ where: { storeId: otherStoreId } });
    await testPrisma.store.deleteMany({ where: { id: otherStoreId } });
    await deleteInventoryFixture(fixture);
  }
  await testPrisma.$disconnect();
});

const offers = (): ActiveOffer[] => [
  { id: "oferta", label: "Feria", type: "FIXED", amount: 3_000, products: [{ productId: ids.ofertaBajoCosto }], categories: [], productGroups: [] },
];

const load = (params: Record<string, string> = {}) => loadLowMargin(testPrisma, fixture!.store.id, parseLowMarginQuery(params), offers());

describe("Margen bajo", () => {
  it("cuenta cada sección con el mínimo de la tienda y deja fuera lo que cumple, lo sin costo, lo archivado y lo de otra tienda", async () => {
    const data = await load();
    expect(data.minimoPct).toBe(40);
    // Componente del fixture: 10.000 con costo 4.000, cumple incluso con Bold. El kit lleva dos: costo 8.000.
    expect(data.counts).toEqual({ "oferta-bajo-costo": 1, "bajo-costo": 1, "bajo-minimo": 1 + EXTRA_BELOW_MINIMUM, "solo-bold": 1, kits: 1 });
    expect(data.sinCosto).toBe(1);
    // Se abre la primera sección con algo, nunca «solo por Bold».
    expect(data.section).toBe("oferta-bajo-costo");
    expect(data.rows).toEqual([expect.objectContaining({ id: ids.ofertaBajoCosto, precio: 8_000, precioOferta: 5_000, oferta: "Feria", costo: 6_000 })]);
  });

  it("cada producto en su sección", async () => {
    const section = async (seccion: string) => (await load({ seccion })).rows.map((row) => row.id);
    expect(await section("bajo-costo")).toEqual([ids.bajoCosto]);
    expect(await section("solo-bold")).toEqual([ids.soloBold]);
    expect(await section("kits")).toEqual([fixture!.kit.id]);
    const firstBelow = await section("bajo-minimo");
    expect(firstBelow).not.toContain(ids.cumple);
    expect(firstBelow).not.toContain(ids.sinCosto);
  });

  it("el kit se mide con el costo de sus piezas, no con el de su ficha", async () => {
    const [kit] = (await load({ seccion: "kits" })).rows;
    expect(kit).toMatchObject({ costo: 8_000, margenPct: 20, clase: "bajo-minimo", esKit: true });
  });

  it("las páginas de una sección no repiten ni pierden, peor margen primero", async () => {
    const first = await load({ seccion: "bajo-minimo" });
    expect(first.pageCount).toBe(Math.ceil((1 + EXTRA_BELOW_MINIMUM) / LOW_MARGIN_PAGE_SIZE));
    expect(first.rows).toHaveLength(LOW_MARGIN_PAGE_SIZE);
    const second = await load({ seccion: "bajo-minimo", pagina: "2" });
    const all = [...first.rows, ...second.rows];
    expect(new Set(all.map((row) => row.id)).size).toBe(1 + EXTRA_BELOW_MINIMUM);
    const margins = all.map((row) => row.margenPct as number);
    expect(margins).toEqual([...margins].sort((a, b) => a - b));
    // Una página que no existe muestra la última.
    expect((await load({ seccion: "bajo-minimo", pagina: "99" })).page).toBe(first.pageCount);
  });

  it("sin mínimo en Configuración solo quedan los que venden bajo el costo", async () => {
    await testPrisma.store.update({ where: { id: fixture!.store.id }, data: { storeMinMarginPercent: null } });
    try {
      const data = await load();
      expect(data.minimoPct).toBeNull();
      expect(data.counts).toMatchObject({ "oferta-bajo-costo": 1, "bajo-costo": 1, "bajo-minimo": 0, "solo-bold": 0 });
    } finally {
      await testPrisma.store.update({ where: { id: fixture!.store.id }, data: { storeMinMarginPercent: 40 } });
    }
  });
});
