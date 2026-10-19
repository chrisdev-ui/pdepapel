import { isProductView, type ProductView } from "@/lib/product-readiness";

/**
 * La consulta de la lista de Productos (pestaña, búsqueda, página, orden y
 * filtros) tal como viaja en la URL. Sin Prisma: la usan la página del
 * servidor, la pantalla en el navegador y las acciones en lote.
 */
export const PRODUCT_PAGE_SIZE = 25;
export const DEFAULT_PRODUCT_VIEW: ProductView = "activos";
/** Valor del filtro «Marca» para los productos sin marca. */
export const NO_BRAND_FILTER_VALUE = "__none__";
const MAX_SEARCH_LENGTH = 80;

export const PRODUCT_LIST_PARAMS = {
  view: "vista",
  search: "q",
  page: "pagina",
  sort: "orden",
  shape: "forma",
  brand: "marca",
  category: "categoria",
  group: "grupo",
} as const;

/** Filtros de columna de la tabla: el id de la columna y su parámetro en la URL. */
export const PRODUCT_FILTER_COLUMNS = [
  { column: "shape", param: PRODUCT_LIST_PARAMS.shape, key: "shape" },
  { column: "brand", param: PRODUCT_LIST_PARAMS.brand, key: "brand" },
  { column: "category", param: PRODUCT_LIST_PARAMS.category, key: "category" },
  { column: "productGroupId", param: PRODUCT_LIST_PARAMS.group, key: "group" },
] as const;

/**
 * Llegan desde Atributos («Ver sus productos») y desde la ficha de la
 * proveedora: todos los productos con ese valor, incluidos los archivados,
 * sin importar la pestaña.
 */
export const PRODUCT_ATTRIBUTE_PARAMS = [
  { param: "color", label: "color", field: "colorId" },
  { param: "tamano", label: "tamaño", field: "sizeId" },
  { param: "diseno", label: "diseño", field: "designId" },
  { param: "subcategoria", label: "subcategoría", field: "categoryId" },
  { param: "proveedor", label: "proveedora", field: "supplierId" },
] as const;

export type ProductAttributeField = (typeof PRODUCT_ATTRIBUTE_PARAMS)[number]["field"];

export const PRODUCT_SORT_COLUMNS = ["name", "shape", "brand", "category", "price", "stock", "readiness", "gtin", "createdAt"] as const;
export type ProductSortColumn = (typeof PRODUCT_SORT_COLUMNS)[number];

export interface ProductListFilters {
  shape: string[];
  brand: string[];
  category: string[];
  group: string[];
}

export interface ProductListQuery {
  view: ProductView;
  search: string;
  page: number;
  sort: { id: ProductSortColumn; desc: boolean } | null;
  filters: ProductListFilters;
  attribute: { param: string; label: string; field: ProductAttributeField; id: string } | null;
}

type SearchParams = Record<string, string | string[] | undefined> | URLSearchParams;

const first = (value: string | string[] | null | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;
const list = (value: string | null) =>
  Array.from(new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))).slice(0, 50);

function toQuery(params: SearchParams): URLSearchParams {
  if (params instanceof URLSearchParams) return params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const single = first(value);
    if (single !== null) query.set(key, single);
  }
  return query;
}

export function parseProductListQuery(params: SearchParams): ProductListQuery {
  const query = toQuery(params);
  const view = query.get(PRODUCT_LIST_PARAMS.view);
  const page = Number.parseInt(query.get(PRODUCT_LIST_PARAMS.page) ?? "1", 10);
  const sortParam = query.get(PRODUCT_LIST_PARAMS.sort) ?? "";
  const desc = sortParam.startsWith("-");
  const sortId = (desc ? sortParam.slice(1) : sortParam) as ProductSortColumn;
  const attribute = PRODUCT_ATTRIBUTE_PARAMS.find((entry) => query.get(entry.param));
  return {
    view: isProductView(view) ? view : DEFAULT_PRODUCT_VIEW,
    search: (query.get(PRODUCT_LIST_PARAMS.search) ?? "").trim().slice(0, MAX_SEARCH_LENGTH),
    page: Number.isFinite(page) && page > 0 ? page : 1,
    sort: PRODUCT_SORT_COLUMNS.includes(sortId) ? { id: sortId, desc } : null,
    filters: {
      shape: list(query.get(PRODUCT_LIST_PARAMS.shape)),
      brand: list(query.get(PRODUCT_LIST_PARAMS.brand)),
      category: list(query.get(PRODUCT_LIST_PARAMS.category)),
      group: list(query.get(PRODUCT_LIST_PARAMS.group)),
    },
    attribute: attribute ? { param: attribute.param, label: attribute.label, field: attribute.field, id: query.get(attribute.param)! } : null,
  };
}

/** La consulta de vuelta a la URL, sin la página: lo que identifica «este filtro». */
export function writeProductListQuery(query: ProductListQuery, target = new URLSearchParams()): URLSearchParams {
  const set = (key: string, value: string | null) => (value ? target.set(key, value) : target.delete(key));
  set(PRODUCT_LIST_PARAMS.view, query.view === DEFAULT_PRODUCT_VIEW ? null : query.view);
  set(PRODUCT_LIST_PARAMS.search, query.search || null);
  set(PRODUCT_LIST_PARAMS.sort, query.sort ? `${query.sort.desc ? "-" : ""}${query.sort.id}` : null);
  for (const { param, key } of PRODUCT_FILTER_COLUMNS) set(param, query.filters[key].join(",") || null);
  for (const entry of PRODUCT_ATTRIBUTE_PARAMS) set(entry.param, query.attribute?.param === entry.param ? query.attribute.id : null);
  target.delete(PRODUCT_LIST_PARAMS.page);
  return target;
}
