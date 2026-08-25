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
