export const CATALOG_CACHE_REVALIDATE_SECONDS = 300;

export const CATALOG_FETCH_CACHE = {
  next: {
    revalidate: CATALOG_CACHE_REVALIDATE_SECONDS,
    tags: ["products"],
  },
};
