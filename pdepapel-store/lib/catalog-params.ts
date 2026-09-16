import { Product, ProductsResponse } from "@/types";

export interface CatalogQuery {
  page?: number;
  typeId?: string;
  categoryId?: string;
  colorId?: string;
  sizeId?: string;
  designId?: string;
  optionValueId?: string;
  isFeatured?: boolean;
  onlyNew?: boolean;
  fromShop?: boolean;
  limit?: number;
  itemsPerPage?: number;
  sortOption?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  excludeProducts?: string;
  search?: string;
  /** Sin corrección ortográfica de la búsqueda. */
  exact?: boolean;
  groupBy?: string;
  productGroupId?: string;
  isOnSale?: boolean;
  ids?: string;
  /** Por defecto el API omite los productos «Próximamente». */
  availability?: "available" | "coming-soon" | "all";
}

export const EMPTY_RESPONSE: ProductsResponse = {
  products: [],
  totalPages: 0,
  totalItems: 0,
};

export const UNAVAILABLE_RESPONSE: ProductsResponse = {
  ...EMPTY_RESPONSE,
  isUnavailable: true,
};

/** Los mismos parámetros para el API de administración y para nuestra ruta. */
export function buildCatalogSearchParams(query: CatalogQuery): URLSearchParams {
  const params = new URLSearchParams();

  if (query.colorId) params.append("colorId", query.colorId);
  if (query.typeId) params.append("typeId", query.typeId);
  if (query.categoryId) params.append("categoryId", query.categoryId);
  if (query.sizeId) params.append("sizeId", query.sizeId);
  if (query.designId) params.append("designId", query.designId);
  if (query.optionValueId) params.append("optionValueId", query.optionValueId);
  if (query.groupBy) params.append("groupBy", query.groupBy);
  if (query.productGroupId) params.append("productGroupId", query.productGroupId);
  if (query.isFeatured !== undefined)
    params.append("isFeatured", String(query.isFeatured));
  if (query.onlyNew !== undefined) params.append("onlyNew", String(query.onlyNew));
  if (query.limit) params.append("limit", String(query.limit));
  if (query.sortOption) params.append("sortOption", query.sortOption);
  if (query.minPrice !== undefined && query.minPrice !== null)
    params.append("minPrice", String(query.minPrice));
  if (query.maxPrice !== undefined && query.maxPrice !== null)
    params.append("maxPrice", String(query.maxPrice));
  if (query.excludeProducts) params.append("excludeProducts", query.excludeProducts);
  if (query.page) params.append("page", String(query.page));
  if (query.itemsPerPage) params.append("itemsPerPage", String(query.itemsPerPage));
  if (query.fromShop !== undefined) params.append("fromShop", String(query.fromShop));
  if (query.search) params.append("search", query.search);
  if (query.exact) params.append("exact", "true");
  if (query.isOnSale) params.append("isOnSale", "true");
  if (query.ids) params.append("ids", query.ids);
  if (query.availability) params.append("availability", query.availability);

  return params;
}

const BOOLEAN_KEYS = ["isFeatured", "onlyNew", "fromShop", "exact", "isOnSale"] as const;
const NUMBER_KEYS = ["page", "limit", "itemsPerPage", "minPrice", "maxPrice"] as const;
const STRING_KEYS = [
  "typeId",
  "categoryId",
  "colorId",
  "sizeId",
  "designId",
  "optionValueId",
  "sortOption",
  "excludeProducts",
  "search",
  "groupBy",
  "productGroupId",
  "ids",
] as const;

const AVAILABILITY = ["available", "coming-soon", "all"] as const;

/** La vuelta del viaje: lo que llega a la ruta se lee con las mismas reglas. */
export function parseCatalogSearchParams(params: URLSearchParams): CatalogQuery {
  const query: CatalogQuery = {};

  for (const key of STRING_KEYS) {
    const value = params.get(key);
    if (value !== null && value !== "") query[key] = value;
  }

  for (const key of NUMBER_KEYS) {
    const value = params.get(key);
    if (value === null || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) query[key] = parsed;
  }

  for (const key of BOOLEAN_KEYS) {
    const value = params.get(key);
    if (value !== null) query[key] = value === "true";
  }

  const availability = params.get("availability");
  if (availability && (AVAILABILITY as readonly string[]).includes(availability)) {
    query.availability = availability as CatalogQuery["availability"];
  }

  return query;
}

export function normalizeProductsResponse(payload: unknown): ProductsResponse {
  if (Array.isArray(payload)) {
    const products = payload as Product[];
    return {
      products,
      totalItems: products.length,
      totalPages: products.length > 0 ? 1 : 0,
    };
  }

  if (
    payload &&
    typeof payload === "object" &&
    "products" in payload &&
    Array.isArray(payload.products)
  ) {
    const response = payload as Partial<ProductsResponse> & {
      products: Product[];
    };
    return {
      ...response,
      products: response.products,
      totalItems: response.totalItems ?? response.products.length,
      totalPages: response.totalPages ?? (response.products.length > 0 ? 1 : 0),
    };
  }

  return UNAVAILABLE_RESPONSE;
}
