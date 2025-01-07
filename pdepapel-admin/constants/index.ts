export const DEFAULT_COUNTRY = "CO";

export type SortOption =
  | "default"
  | "dateAdded"
  | "priceLowToHigh"
  | "priceHighToLow"
  | "name"
  | "featuredFirst";

export type PriceRanges =
  | "[0,5000]"
  | "[5000,10000]"
  | "[10000,20000]"
  | "[20000,50000]"
  | "[50000,99999999]";

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

export const START_YEAR = 2023;
