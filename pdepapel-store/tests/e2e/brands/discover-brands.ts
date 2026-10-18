import {
  brandCandidates,
  discoveryApi,
  hasEnoughStock,
  inStockOwnProducts,
  pickEmptyBrand,
  pickLine,
  type PublicBrandRow,
  type PublicProductRow,
} from "./brand-discovery";

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} respondió ${response.status}`);
  return (await response.json()) as T;
}

function setIfMissing(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) if (!process.env[key]) process.env[key] = value;
}

/** globalSetup de playwright.brands.config.ts: los workers heredan estas variables. */
export default async function discoverBrands() {
  const api = discoveryApi(process.env);
  if (!api) {
    console.log("[marcas] sin E2E_ADMIN_API_URL para esta tienda: se usan solo las variables E2E_*.");
    return;
  }

  const brands = await json<PublicBrandRow[]>(`${api}/brands`);

  if (!process.env.E2E_BRAND_SLUG) {
    let found = false;
    for (const brand of brandCandidates(brands)) {
      const { products } = await json<{ products: PublicProductRow[] }>(
        `${api}/products?marca=${encodeURIComponent(brand.slug)}&fromShop=true&itemsPerPage=24&groupBy=parents`,
      );
      const own = inStockOwnProducts(brand.slug, products);
      if (!hasEnoughStock(own)) continue;
      setIfMissing({ E2E_BRAND_SLUG: brand.slug, E2E_BRAND_NAME: brand.name, E2E_BRAND_PRODUCT_SLUG: own[0].slug });
      found = true;
      break;
    }
    if (!found) throw new Error("[marcas] ninguna marca visible tiene 3 productos propios con existencias: define E2E_BRAND_SLUG, E2E_BRAND_NAME y E2E_BRAND_PRODUCT_SLUG.");
  }

  const empty = pickEmptyBrand(brands);
  if (empty) setIfMissing({ E2E_EMPTY_BRAND_SLUG: empty.slug });

  const line = pickLine(brands);
  if (line?.parent) {
    setIfMissing({ E2E_LINE_BRAND_SLUG: line.slug, E2E_LINE_BRAND_NAME: line.name, E2E_PARENT_BRAND_SLUG: line.parent.slug, E2E_PARENT_BRAND_NAME: line.parent.name });
  }

  const shown = ["E2E_BRAND_SLUG", "E2E_BRAND_PRODUCT_SLUG", "E2E_EMPTY_BRAND_SLUG", "E2E_PARENT_BRAND_SLUG", "E2E_LINE_BRAND_SLUG", "E2E_HIDDEN_BRAND_SLUG"];
  console.log(`[marcas] ${shown.map((key) => `${key}=${process.env[key] || "(sin dato: se salta)"}`).join(" ")}`);
}
