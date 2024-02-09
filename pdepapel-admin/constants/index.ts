import { QueryParamConfig, SortOption } from "@/lib/types";

export const DEFAULT_COUNTRY = "CO";

export const SORT_OPTIONS: Record<
  SortOption,
  Record<string, "asc" | "desc">
> = {
  default: { createdAt: "desc" },
  dateAdded: { createdAt: "desc" },
  priceLowToHigh: { price: "asc" },
  priceHighToLow: { price: "desc" },
  name: { name: "asc" },
  featuredFirst: { isFeatured: "desc" },
};
export const PRICE_RANGES = {
  "[0,5000]": { gte: 0, lte: 5000 },
  "[5000,10000]": { gte: 5000, lte: 10000 },
  "[10000,20000]": { gte: 10000, lte: 20000 },
  "[20000,50000]": { gte: 20000, lte: 50000 },
  "[50000,99999999]": { gte: 50000 },
};

export const MINIMUM_TIME_BETWEEN_ORDERS_IN_MINUTES = 3;

export const FULL_QUERY_PARAMS_CONFIG: QueryParamConfig = {
  page: { defaultValue: 1, parser: Number },
  itemsPerPage: { defaultValue: 52, parser: Number },
  typeId: { defaultValue: [], parser: (value) => value?.split(",") },
  categoryId: { defaultValue: [], parser: (value) => value?.split(",") },
  colorId: { defaultValue: [], parser: (value) => value?.split(",") },
  sizeId: { defaultValue: [], parser: (value) => value?.split(",") },
  designId: { defaultValue: [], parser: (value) => value?.split(",") },
  isFeatured: { defaultValue: false, parser: Boolean },
  onlyNew: { defaultValue: false, parser: Boolean },
  fromShop: { defaultValue: false, parser: Boolean },
  limit: { defaultValue: undefined, parser: Number },
  sortOption: { defaultValue: "default" },
  priceRange: { defaultValue: undefined },
  excludeProducts: { defaultValue: undefined },
  search: { defaultValue: "" },
};

export const SEARCH_QUERY_PARAMS_CONFIG: QueryParamConfig = {
  page: { defaultValue: 1, parser: Number },
  limit: { defaultValue: 10, parser: Number },
  search: { defaultValue: "" },
};
