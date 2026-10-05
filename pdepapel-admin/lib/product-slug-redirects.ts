export type ProductSlugRedirectAlias = {
  slug: string;
  product: {
    slug: string | null;
  };
};

const SAFE_PRODUCT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function buildProductSlugRedirects(
  aliases: ProductSlugRedirectAlias[],
  canonicalSlugs: Iterable<string | null | undefined>,
) {
  const canonicalSlugSet = new Set(
    Array.from(canonicalSlugs).filter((slug): slug is string =>
      Boolean(slug && SAFE_PRODUCT_SLUG.test(slug)),
    ),
  );
  const redirects = new Map<string, string>();

  for (const alias of aliases) {
    const destinationSlug = alias.product.slug;

    if (
      !SAFE_PRODUCT_SLUG.test(alias.slug) ||
      !destinationSlug ||
      !SAFE_PRODUCT_SLUG.test(destinationSlug) ||
      alias.slug === destinationSlug ||
      canonicalSlugSet.has(alias.slug)
    ) {
      continue;
    }

    redirects.set(`/producto/${alias.slug}`, `/producto/${destinationSlug}`);
  }

  return Array.from(redirects, ([source, destination]) => ({
    source,
    destination,
  })).sort((left, right) => left.source.localeCompare(right.source));
}

export type RedirectCollapseInput = {
  /** Mapa vigente de la tienda (`lib/legacy-product-redirects.mjs`). */
  legacy: Array<{ source: string; destination: string }>;
  aliases: Array<{ slug: string; productId: string }>;
  products: Array<{ id: string; slug: string | null; isArchived: boolean }>;
};

export type RedirectCollapseReport = {
  redirects: Array<{ source: string; destination: string }>;
  kept: number;
  collapsed: Array<{ source: string; from: string; to: string }>;
  dropped: Array<{ source: string; destination: string; reason: "destino-archivado-o-inexistente" | "origen-es-producto-vivo" }>;
  added: number;
};

const productSlugFromPath = (path: string) => path.replace(/^\/producto\//, "");

/**
 * Rehace el mapa de redirecciones de producto contra el catálogo actual:
 * cada origen apunta directo al destino final vivo (A→B→C queda A→C), se
 * descartan los destinos archivados o inexistentes (ahí decide la página) y
 * ningún origen puede ser la URL de un producto vivo.
 */
export function collapseProductRedirects({ legacy, aliases, products }: RedirectCollapseInput): RedirectCollapseReport {
  const byId = new Map(products.map((product) => [product.id, product]));
  const liveBySlug = new Map(
    products.filter((product) => !product.isArchived && product.slug).map((product) => [product.slug as string, product]),
  );
  const aliasBySlug = new Map(aliases.map((alias) => [alias.slug, alias.productId]));
  const canonical = (product: { id: string; slug: string | null }) => product.slug || product.id;

  /** Slug final vivo para un slug cualquiera, o null si termina en archivado/inexistente. */
  const resolve = (slug: string): string | null => {
    const live = liveBySlug.get(slug);
    if (live) return canonical(live);
    const target = byId.get(aliasBySlug.get(slug) ?? slug);
    if (!target || target.isArchived) return null;
    return canonical(target);
  };

  const redirects = new Map<string, string>();
  const collapsed: RedirectCollapseReport["collapsed"] = [];
  const dropped: RedirectCollapseReport["dropped"] = [];
  let kept = 0;

  for (const entry of legacy) {
    const sourceSlug = productSlugFromPath(entry.source);
    if (liveBySlug.has(sourceSlug)) {
      dropped.push({ ...entry, reason: "origen-es-producto-vivo" });
      continue;
    }
    const finalSlug = resolve(productSlugFromPath(entry.destination)) ?? resolve(sourceSlug);
    if (!finalSlug || !SAFE_PRODUCT_SLUG.test(finalSlug) || finalSlug === sourceSlug) {
      dropped.push({ ...entry, reason: "destino-archivado-o-inexistente" });
      continue;
    }
    const destination = `/producto/${finalSlug}`;
    if (destination === entry.destination) kept += 1;
    else collapsed.push({ source: entry.source, from: entry.destination, to: destination });
    redirects.set(entry.source, destination);
  }

  let added = 0;
  for (const alias of aliases) {
    const source = `/producto/${alias.slug}`;
    if (redirects.has(source) || !SAFE_PRODUCT_SLUG.test(alias.slug) || liveBySlug.has(alias.slug)) continue;
    const finalSlug = resolve(alias.slug);
    if (!finalSlug || !SAFE_PRODUCT_SLUG.test(finalSlug) || finalSlug === alias.slug) continue;
    redirects.set(source, `/producto/${finalSlug}`);
    added += 1;
  }

  return {
    redirects: Array.from(redirects, ([source, destination]) => ({ source, destination })).sort((left, right) =>
      left.source.localeCompare(right.source),
    ),
    kept,
    collapsed,
    dropped,
    added,
  };
}
