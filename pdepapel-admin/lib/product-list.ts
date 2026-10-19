/**
 * La lista de Productos, paginada en el servidor como la de Pedidos
 * (`lib/order-list.ts`). Las pestañas («Sin completar», «En oferta»,
 * «Transporte por revisar», el stock de un kit) son reglas en código que
 * comparte todo el panel; en vez de copiarlas a SQL se lee una fila liviana
 * por producto, se clasifica con esas mismas funciones y de ahí salen los
 * conteos, las opciones de los filtros, el orden y los ids de la página.
 * Después solo esas filas se cargan completas.
 */
import type { Prisma } from "@prisma/client";

import { pickBestOffer, type ActiveOffer } from "@/lib/offer-pricing";
import {
  PRODUCT_VIEWS,
  getListReadiness,
  getProductShape,
  productMatchesView,
  type ProductShape,
  type ProductView,
} from "@/lib/product-readiness";
import { VIEWER_HIDDEN_PRODUCT_FIELDS } from "@/lib/viewer-payloads";
import {
  NO_BRAND_FILTER_VALUE,
  PRODUCT_PAGE_SIZE,
  type ProductListFilters,
  type ProductListQuery,
  type ProductSortColumn,
} from "@/lib/product-list-query";

export * from "@/lib/product-list-query";

/** Lo justo para clasificar, filtrar, buscar y ordenar cada producto. */
export const PRODUCT_LIST_SELECT = {
  id: true,
  name: true,
  sku: true,
  gtin: true,
  price: true,
  acqPrice: true,
  transportationCost: true,
  hasNoProductIdentifier: true,
  stock: true,
  isArchived: true,
  availableAt: true,
  categoryId: true,
  colorId: true,
  sizeId: true,
  designId: true,
  productGroupId: true,
  isKit: true,
  brandId: true,
  createdAt: true,
  kitComponents: { select: { quantity: true, component: { select: { stock: true } } } },
  _count: { select: { images: true } },
} satisfies Prisma.ProductSelect;

export type ProductListRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_LIST_SELECT }>;

/** Stock que se puede vender: el de un kit sale de sus piezas. */
export function effectiveStock(product: { stock: number; isKit: boolean; kitComponents: { quantity: number; component: { stock: number } }[] }): number {
  if (!product.isKit || product.kitComponents.length === 0) return product.stock;
  const stock = Math.min(...product.kitComponents.map((c) => (c.quantity > 0 ? Math.floor(c.component.stock / c.quantity) : 0)));
  return Math.max(0, stock);
}

export interface ProductListNames {
  categories: ReadonlyMap<string, string>;
  brands: ReadonlyMap<string, { name: string; isArchived: boolean }>;
  groups: ReadonlyMap<string, string>;
}

export interface ProductListContext {
  offers: readonly ActiveOffer[];
  threshold: number;
  names: ProductListNames;
  /** Imágenes rotas por producto (cron de salud de imágenes). */
  brokenImages: ReadonlyMap<string, number>;
  /** Cuenta de solo lectura: clasifica sin costo ni transporte, como siempre la vio. */
  viewer?: boolean;
}

export interface ProductFacetOption {
  label: string;
  value: string;
  count: number;
}

export interface ProductListPage {
  ids: string[];
  /** Conteo de cada pestaña con los filtros y la búsqueda puestos: coincide con lo que lista esa pestaña. */
  counts: Record<ProductView, number>;
  /** Conteo de toda la tienda, sin filtros: el resumen de la cabecera. */
  summary: Record<ProductView, number>;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  facets: { shape: ProductFacetOption[]; brand: ProductFacetOption[]; category: ProductFacetOption[]; group: ProductFacetOption[] };
}

const SHAPE_OPTIONS: { value: ProductShape; label: string }[] = [
  { value: "individual", label: "Individual" },
  { value: "variante", label: "Variante" },
  { value: "kit", label: "Kit" },
];

/** Minúsculas y sin tildes: «lapiz» encuentra «Lápiz». */
export const foldText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

interface Classified {
  row: ProductListRow;
  shape: ProductShape;
  brand: string;
  category: string;
  group: string;
  stock: number;
  readiness: "Lista" | "Sin completar";
  views: Set<ProductView>;
  haystack: string;
}

function classify(row: ProductListRow, ctx: ProductListContext): Classified {
  const visible = ctx.viewer ? (omitFields(row, VIEWER_HIDDEN_PRODUCT_FIELDS) as ProductListRow) : row;
  const stock = effectiveStock(row);
  const offer = pickBestOffer({ id: row.id, price: row.price, categoryId: row.categoryId, productGroupId: row.productGroupId }, ctx.offers);
  const product = {
    ...visible,
    stock,
    images: row._count.images,
    brokenImages: ctx.brokenImages.get(row.id) ?? 0,
    hasDiscount: offer.price < row.price,
  };
  const views = new Set<ProductView>();
  for (const { id } of PRODUCT_VIEWS) if (productMatchesView(product, id, ctx.threshold)) views.add(id);
  const shape = getProductShape(row);
  const brand = row.brandId ? (ctx.names.brands.get(row.brandId)?.name ?? "") : "";
  const category = ctx.names.categories.get(row.categoryId) ?? "";
  const group = row.productGroupId ? (ctx.names.groups.get(row.productGroupId) ?? "") : "";
  const shapeLabel = SHAPE_OPTIONS.find((option) => option.value === shape.id)!.label;
  return {
    row,
    shape: shape.id,
    brand,
    category,
    group,
    stock,
    readiness: getListReadiness(product).complete ? "Lista" : "Sin completar",
    views,
    // Lo mismo que buscaba la tabla: nombre, SKU, GTIN, grupo, marca, forma y subcategoría.
    haystack: foldText([row.name, row.sku, row.gtin, group, brand, shapeLabel, category].filter(Boolean).join(" ")),
  };
}

function omitFields<T extends Record<string, unknown>>(row: T, fields: readonly string[]): Partial<T> {
  const copy: Record<string, unknown> = { ...row };
  for (const field of fields) delete copy[field];
  return copy as Partial<T>;
}

const filterValue = {
  shape: (item: Classified) => item.shape,
  brand: (item: Classified) => item.row.brandId ?? NO_BRAND_FILTER_VALUE,
  category: (item: Classified) => item.row.categoryId,
  group: (item: Classified) => item.row.productGroupId ?? "",
} satisfies Record<keyof ProductListFilters, (item: Classified) => string>;

const compare: Record<ProductSortColumn, (a: Classified, b: Classified) => number> = {
  name: (a, b) => collator.compare(a.row.name, b.row.name),
  shape: (a, b) => collator.compare(a.shape, b.shape),
  brand: (a, b) => collator.compare(a.brand, b.brand),
  category: (a, b) => collator.compare(a.category, b.category),
  price: (a, b) => a.row.price - b.row.price,
  stock: (a, b) => a.stock - b.stock,
  readiness: (a, b) => collator.compare(a.readiness, b.readiness),
  gtin: (a, b) => collator.compare(a.row.gtin ?? "", b.row.gtin ?? ""),
  createdAt: (a, b) => new Date(a.row.createdAt).getTime() - new Date(b.row.createdAt).getTime(),
};

/**
 * Los productos que muestra la lista con esta consulta, en su orden y sin
 * cortar en páginas: la página es un pedazo, y «Seleccionar los N de este
 * filtro» usa la lista entera. Las filas vienen de la más nueva a la más vieja.
 */
export function matchProducts(rows: readonly ProductListRow[], query: ProductListQuery, ctx: ProductListContext) {
  const items = rows.map((row) => classify(row, ctx));
  const words = foldText(query.search).split(/\s+/).filter(Boolean).slice(0, 8);
  const matchesSearch = (item: Classified) => words.every((word) => item.haystack.includes(word));
  const matchesAttribute = (item: Classified) => !query.attribute || item.row[query.attribute.field] === query.attribute.id;
  const matchesFilters = (item: Classified, skip?: keyof ProductListFilters) =>
    (Object.keys(filterValue) as (keyof ProductListFilters)[]).every(
      (key) => key === skip || query.filters[key].length === 0 || query.filters[key].includes(filterValue[key](item)),
    );
  // Con un atributo de Atributos o con texto en el buscador se mira en todas las pestañas.
  const ignoresView = Boolean(query.attribute) || words.length > 0;
  const inScope = (item: Classified) => matchesAttribute(item) && matchesSearch(item) && (ignoresView || item.views.has(query.view));

  const summary = Object.fromEntries(PRODUCT_VIEWS.map((view) => [view.id, 0])) as Record<ProductView, number>;
  const counts = { ...summary };
  const matching: Classified[] = [];
  for (const item of items) {
    item.views.forEach((view) => (summary[view] += 1));
    if (matchesAttribute(item) && matchesSearch(item) && matchesFilters(item)) item.views.forEach((view) => (counts[view] += 1));
    if (inScope(item) && matchesFilters(item)) matching.push(item);
  }

  if (query.sort) {
    const { id, desc } = query.sort;
    // El orden de llegada (más nuevo primero) desempata: `sort` es estable.
    matching.sort((a, b) => (desc ? -1 : 1) * compare[id](a, b));
  }

  const facetCounts = (key: keyof ProductListFilters) => {
    const result = new Map<string, number>();
    for (const item of items) {
      if (!inScope(item) || !matchesFilters(item, key)) continue;
      const value = filterValue[key](item);
      result.set(value, (result.get(value) ?? 0) + 1);
    }
    return result;
  };

  return { items, matching, counts, summary, facetCounts };
}

/** La parte pura: clasificar, contar, filtrar, ordenar y cortar la página. */
export function paginateProducts(
  rows: readonly ProductListRow[],
  query: ProductListQuery,
  ctx: ProductListContext,
  pageSize = PRODUCT_PAGE_SIZE,
): ProductListPage {
  const { items, matching, counts, summary, facetCounts } = matchProducts(rows, query, ctx);
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.min(query.page, pageCount);

  // Las opciones salen de todo el catálogo, como antes; el número, del contexto actual.
  const options = (key: keyof ProductListFilters, label: (value: string) => string, sort = true) => {
    const counted = facetCounts(key);
    const values = Array.from(new Set(items.map((item) => filterValue[key](item)).filter(Boolean)));
    const result = values.map((value) => ({ value, label: label(value), count: counted.get(value) ?? 0 }));
    return sort ? result.sort((a, b) => collator.compare(a.label, b.label)) : result;
  };
  const brand = options("brand", (value) => ctx.names.brands.get(value)?.name ?? "—").filter((option) => option.value !== NO_BRAND_FILTER_VALUE);
  const withoutBrand = items.some((item) => !item.row.brandId);
  const shapeCounts = facetCounts("shape");

  return {
    ids: matching.slice((page - 1) * pageSize, page * pageSize).map((item) => item.row.id),
    counts,
    summary,
    total: matching.length,
    page,
    pageCount,
    pageSize,
    facets: {
      shape: SHAPE_OPTIONS.map((option) => ({ ...option, count: shapeCounts.get(option.value) ?? 0 })),
      brand: withoutBrand ? [{ value: NO_BRAND_FILTER_VALUE, label: "Sin marca", count: facetCounts("brand").get(NO_BRAND_FILTER_VALUE) ?? 0 }, ...brand] : brand,
      category: options("category", (value) => ctx.names.categories.get(value) ?? "—"),
      group: options("group", (value) => ctx.names.groups.get(value) ?? "—"),
    },
  };
}

type ProductListDb = {
  product: { findMany: (args: { where: Prisma.ProductWhereInput; select: typeof PRODUCT_LIST_SELECT; orderBy: Prisma.ProductOrderByWithRelationInput[] }) => Promise<ProductListRow[]> };
  image: { groupBy: (args: any) => Promise<{ productId: string | null; _count: { _all: number } }[]> };
  category: { findMany: (args: { where: { storeId: string }; select: { id: true; name: true } }) => Promise<{ id: string; name: string }[]> };
  brand: { findMany: (args: { where: { storeId: string }; select: { id: true; name: true; isArchived: true } }) => Promise<{ id: string; name: string; isArchived: boolean }[]> };
  productGroup: { findMany: (args: { where: { storeId: string }; select: { id: true; name: true } }) => Promise<{ id: string; name: string }[]> };
};

/** Las filas livianas de toda la tienda y lo que hace falta para clasificarlas. */
export async function loadProductListRows(
  db: ProductListDb,
  storeId: string,
  options: { offers: readonly ActiveOffer[]; threshold: number; viewer?: boolean },
): Promise<{ rows: ProductListRow[]; ctx: ProductListContext }> {
  const [rows, broken, categories, brands, groups] = await Promise.all([
    db.product.findMany({ where: { storeId }, select: PRODUCT_LIST_SELECT, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    db.image.groupBy({ by: ["productId"], where: { brokenAt: { not: null }, product: { storeId } }, _count: { _all: true } }),
    db.category.findMany({ where: { storeId }, select: { id: true, name: true } }),
    db.brand.findMany({ where: { storeId }, select: { id: true, name: true, isArchived: true } }),
    db.productGroup.findMany({ where: { storeId }, select: { id: true, name: true } }),
  ]);
  return {
    rows,
    ctx: {
      offers: options.offers,
      threshold: options.threshold,
      viewer: options.viewer,
      brokenImages: new Map(broken.filter((row) => row.productId).map((row) => [row.productId!, row._count._all])),
      names: {
        categories: new Map(categories.map((row) => [row.id, row.name])),
        brands: new Map(brands.map((row) => [row.id, { name: row.name, isArchived: row.isArchived }])),
        groups: new Map(groups.map((row) => [row.id, row.name])),
      },
    },
  };
}

export async function listProductPage(
  db: ProductListDb,
  storeId: string,
  query: ProductListQuery,
  options: { offers: readonly ActiveOffer[]; threshold: number; viewer?: boolean },
): Promise<ProductListPage> {
  const { rows, ctx } = await loadProductListRows(db, storeId, options);
  return paginateProducts(rows, query, ctx);
}
