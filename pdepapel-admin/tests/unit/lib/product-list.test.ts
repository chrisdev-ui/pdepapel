import { describe, expect, it } from "vitest";

import type { ActiveOffer } from "@/lib/offer-pricing";
import {
  NO_BRAND_FILTER_VALUE,
  PRODUCT_PAGE_SIZE,
  paginateProducts,
  parseProductListQuery,
  writeProductListQuery,
  type ProductListContext,
  type ProductListRow,
} from "@/lib/product-list";
import { PRODUCT_VIEWS } from "@/lib/product-readiness";

const DAY = 86_400_000;
const base = Date.UTC(2026, 9, 1);

let seq = 0;
function row(overrides: Partial<ProductListRow> = {}): ProductListRow {
  seq += 1;
  return {
    id: `p-${String(seq).padStart(3, "0")}`,
    name: `Producto ${seq}`,
    sku: `SKU-${seq}`,
    gtin: null,
    price: 10_000,
    acqPrice: 4_000,
    transportationCost: null,
    hasNoProductIdentifier: true,
    stock: 10,
    isArchived: false,
    availableAt: null,
    categoryId: "c-agendas",
    colorId: "col-rosa",
    sizeId: "s-unico",
    designId: "d-liso",
    productGroupId: null,
    isKit: false,
    brandId: null,
    createdAt: new Date(base - seq * DAY),
    kitComponents: [],
    _count: { images: 1 },
    ...overrides,
  };
}

const ctx = (overrides: Partial<ProductListContext> = {}): ProductListContext => ({
  offers: [],
  threshold: 3,
  brokenImages: new Map(),
  names: {
    categories: new Map([
      ["c-agendas", "Agendas"],
      ["c-lapices", "Lápices"],
    ]),
    brands: new Map([
      ["b-kiut", { name: "Kiut", isArchived: false }],
      ["b-norma", { name: "Norma", isArchived: false }],
    ]),
    groups: new Map([["g-hadas", "Libreta hadas"]]),
  },
  ...overrides,
});

const q = (params: Record<string, string> = {}) => parseProductListQuery(params);

describe("parseProductListQuery / writeProductListQuery", () => {
  it("lee pestaña, búsqueda, página, orden, filtros y atributo, y los escribe de vuelta sin la página", () => {
    const query = q({ vista: "agotados", q: "  lápiz  ", pagina: "3", orden: "-price", forma: "kit,variante", marca: `b-kiut,${NO_BRAND_FILTER_VALUE}`, categoria: "c-1", grupo: "g-1", color: "col-1" });
    expect(query).toMatchObject({
      view: "agotados",
      search: "lápiz",
      page: 3,
      sort: { id: "price", desc: true },
      filters: { shape: ["kit", "variante"], brand: ["b-kiut", NO_BRAND_FILTER_VALUE], category: ["c-1"], group: ["g-1"] },
      attribute: { param: "color", field: "colorId", id: "col-1" },
    });
    expect(writeProductListQuery(query).toString()).toBe(
      "vista=agotados&q=l%C3%A1piz&orden=-price&forma=kit%2Cvariante&marca=b-kiut%2C__none__&categoria=c-1&grupo=g-1&color=col-1",
    );
  });

  it("valores inválidos vuelven a lo de siempre", () => {
    expect(q({ vista: "nada", pagina: "-2", orden: "secreto" })).toMatchObject({ view: "activos", page: 1, sort: null, attribute: null });
  });
});

describe("paginateProducts", () => {
  it("corta páginas de 25 sin repetir ni perder, y una página de más cae en la última", () => {
    const rows = Array.from({ length: 60 }, () => row());
    const first = paginateProducts(rows, q(), ctx());
    const third = paginateProducts(rows, q({ pagina: "3" }), ctx());
    const beyond = paginateProducts(rows, q({ pagina: "99" }), ctx());
    expect(first).toMatchObject({ total: 60, page: 1, pageCount: 3, pageSize: PRODUCT_PAGE_SIZE });
    expect(first.ids).toEqual(rows.slice(0, 25).map((r) => r.id));
    expect(third.ids).toEqual(rows.slice(50).map((r) => r.id));
    expect(beyond).toMatchObject({ page: 3, ids: third.ids });
  });

  it("sin resultados: una página vacía, no un error", () => {
    const result = paginateProducts([row()], q({ q: "zzz-nada" }), ctx());
    expect(result).toMatchObject({ total: 0, page: 1, pageCount: 1, ids: [] });
    expect(paginateProducts([], q(), ctx())).toMatchObject({ total: 0, ids: [] });
  });

  it("cada pestaña cuenta lo mismo que lista, y la cabecera cuenta toda la tienda", () => {
    const rows = [
      row(),
      row({ isArchived: true }),
      row({ stock: 0 }),
      row({ stock: 2 }),
      row({ acqPrice: null }),
      row({ hasNoProductIdentifier: false }),
      row({ availableAt: new Date(Date.now() + 10 * DAY) }),
      row({ transportationCost: 1000 }),
      row({ id: "con-oferta", categoryId: "c-lapices" }),
      row({ brandId: "b-kiut" }),
    ];
    const offers: ActiveOffer[] = [{ id: "o-1", label: "-10%", type: "PERCENTAGE", amount: 10, products: [{ productId: "con-oferta" }], categories: [], productGroups: [] }];
    for (const marca of [undefined, NO_BRAND_FILTER_VALUE, "b-kiut"]) {
      const params: Record<string, string> = marca ? { marca } : {};
      const result = paginateProducts(rows, q(params), ctx({ offers }));
      for (const view of PRODUCT_VIEWS) {
        expect(paginateProducts(rows, q({ ...params, vista: view.id }), ctx({ offers })).total, `${view.id} ${marca}`).toBe(result.counts[view.id]);
      }
      expect(result.summary).toEqual(paginateProducts(rows, q(), ctx({ offers })).summary);
    }
    const summary = paginateProducts(rows, q(), ctx({ offers })).summary;
    expect(summary).toMatchObject({ todos: 10, archivados: 1, activos: 9, agotados: 1, "stock-critico": 1, "en-oferta": 1, proximamente: 1 });
  });

  it("busca sin importar tildes ni mayúsculas, en nombre, SKU, GTIN, grupo, marca, forma y subcategoría, y en todas las pestañas", () => {
    const rows = [
      row({ name: "Lápiz HB", isArchived: true }),
      row({ name: "Lapicero azul", categoryId: "c-lapices" }),
      row({ name: "Cuaderno", gtin: "7701234567890" }),
      row({ name: "Libreta", productGroupId: "g-hadas" }),
      row({ name: "Stickers", brandId: "b-kiut" }),
    ];
    const ids = (text: string) => paginateProducts(rows, q({ q: text }), ctx()).ids;
    expect(ids("lapiz")).toEqual([rows[0].id]);
    expect(ids("LÁPIZ hb")).toEqual([rows[0].id]);
    expect(ids("lápices")).toEqual([rows[1].id]);
    expect(ids("7701234")).toEqual([rows[2].id]);
    expect(ids("hadas")).toEqual([rows[3].id]);
    expect(ids("variante")).toEqual([rows[3].id]);
    expect(ids("kiut")).toEqual([rows[4].id]);
    expect(ids(rows[1].sku)).toEqual([rows[1].id]);
  });

  it("filtra por forma, marca (incluida «Sin marca»), subcategoría y grupo, con opciones de todo el catálogo", () => {
    const rows = [
      row({ brandId: "b-kiut" }),
      row({ brandId: "b-norma", isArchived: true }),
      row(),
      row({ productGroupId: "g-hadas", brandId: "b-kiut" }),
      row({ isKit: true, kitComponents: [{ quantity: 2, component: { stock: 9 } }] }),
    ];
    const total = (params: Record<string, string>) => paginateProducts(rows, q(params), ctx()).total;
    expect(total({ marca: NO_BRAND_FILTER_VALUE })).toBe(2);
    expect(total({ marca: "b-kiut" })).toBe(2);
    expect(total({ marca: `b-kiut,${NO_BRAND_FILTER_VALUE}` })).toBe(4);
    expect(total({ vista: "archivados", marca: "b-norma" })).toBe(1);
    expect(total({ forma: "kit" })).toBe(1);
    expect(total({ forma: "variante" })).toBe(1);
    expect(total({ grupo: "g-hadas" })).toBe(1);
    expect(total({ categoria: "c-agendas", forma: "individual" })).toBe(2);
    const facets = paginateProducts(rows, q(), ctx()).facets;
    expect(facets.brand).toEqual([
      { value: NO_BRAND_FILTER_VALUE, label: "Sin marca", count: 2 },
      { value: "b-kiut", label: "Kiut", count: 2 },
      // Norma solo tiene un archivado: sale en la lista, sin productos en «A la venta».
      { value: "b-norma", label: "Norma", count: 0 },
    ]);
    expect(facets.shape).toEqual([
      { value: "individual", label: "Individual", count: 2 },
      { value: "variante", label: "Variante", count: 1 },
      { value: "kit", label: "Kit", count: 1 },
    ]);
  });

  it("un atributo que llega desde Atributos lista sus productos, incluidos los archivados, en cualquier pestaña", () => {
    const rows = [row({ colorId: "col-azul" }), row({ colorId: "col-azul", isArchived: true }), row({ categoryId: "c-lapices" })];
    expect(paginateProducts(rows, q({ color: "col-azul" }), ctx()).total).toBe(2);
    expect(paginateProducts(rows, q({ color: "col-azul", vista: "agotados" }), ctx()).total).toBe(2);
    expect(paginateProducts(rows, q({ subcategoria: "c-lapices" }), ctx()).total).toBe(1);
  });

  it("ordena toda la lista, no solo la página, y desempata con el más nuevo primero", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row({ price: (i % 7) * 1000, name: `Item ${30 - i}` }));
    const byPrice = paginateProducts(rows, q({ orden: "price" }), ctx());
    const all = [...byPrice.ids, ...paginateProducts(rows, q({ orden: "price", pagina: "2" }), ctx()).ids];
    const prices = all.map((id) => rows.find((r) => r.id === id)!.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(all.slice(0, 5)).toEqual(rows.filter((r) => r.price === 0).map((r) => r.id));
    const desc = paginateProducts(rows, q({ orden: "-price" }), ctx());
    expect(rows.find((r) => r.id === desc.ids[0])!.price).toBe(6000);
    const byName = paginateProducts(rows, q({ orden: "name" }), ctx()).ids;
    // Orden natural: «Item 2» antes que «Item 10».
    expect(byName.slice(0, 3).map((id) => rows.find((r) => r.id === id)!.name)).toEqual(["Item 1", "Item 2", "Item 3"]);
  });

  it("el stock de un kit sale de sus piezas para «Agotados» y para ordenar", () => {
    const kit = row({ isKit: true, stock: 50, kitComponents: [{ quantity: 3, component: { stock: 2 } }] });
    const result = paginateProducts([kit, row()], q({ vista: "agotados" }), ctx());
    expect(result.ids).toEqual([kit.id]);
  });

  it("la cuenta de solo lectura clasifica sin costo ni transporte, como la veía en el navegador", () => {
    const rows = [row({ transportationCost: 1000 }), row()];
    expect(paginateProducts(rows, q(), ctx()).counts["transporte-por-revisar"]).toBe(1);
    const viewer = paginateProducts(rows, q(), ctx({ viewer: true })).counts;
    expect(viewer["transporte-por-revisar"]).toBe(0);
    expect(viewer["sin-completar"]).toBe(2);
  });
});
