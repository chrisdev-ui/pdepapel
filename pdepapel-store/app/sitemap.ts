import { getCategoriesOrThrow } from "@/actions/get-categories";
import { getProducts } from "@/actions/get-products";
import { getSitemapProducts } from "@/actions/get-sitemap-products";
import { BASE_URL } from "@/constants";
import { categoryPath, productPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { MetadataRoute } from "next";

const getLastModified = (updatedAt?: string) => {
  if (!updatedAt) return undefined;

  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/**
 * Si el catálogo no responde, el sitemap falla a propósito: Next sigue
 * sirviendo la última versión buena (ISR) en lugar de cachear durante minutos
 * uno con solo las páginas fijas. Un catálogo sin productos activos también se
 * trata como fallo: la tienda nunca está vacía, así que es la API o su
 * configuración.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [sitemapProducts, categories] = await Promise.all([
    getSitemapProducts(),
    getCategoriesOrThrow(),
  ]);

  const products = sitemapProducts.filter((product) => !product.isArchived);
  if (products.length === 0) {
    throw new Error("El catálogo devolvió 0 productos activos para el sitemap");
  }

  const productsUrls: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${BASE_URL}${productPath(product.slug || product.id)}`,
    lastModified: getLastModified(product.updatedAt),
  }));

  const categoryUrls: MetadataRoute.Sitemap = categories
    .filter((category) => category.seoEnabled && category.slug)
    .map((category) => ({
      url: `${BASE_URL}${categoryPath(category.slug!)}`,
    }));

  // /proximamente sin productos es noindex: anunciarla en el sitemap haría que
  // Search Console la marque como «enviada pero excluida por noindex».
  let comingSoonUrls: MetadataRoute.Sitemap = [];
  try {
    const { products } = await getProducts({ availability: "coming-soon", limit: 1, groupBy: "parents" });
    if (products.length > 0) comingSoonUrls = [{ url: `${BASE_URL}${STOREFRONT_ROUTES.comingSoon}` }];
  } catch (error) {
    console.warn("Failed to check coming-soon products for sitemap:", error);
  }

  return [
    {
      url: BASE_URL,
    },
    {
      url: `${BASE_URL}${STOREFRONT_ROUTES.about}`,
    },
    {
      url: `${BASE_URL}${STOREFRONT_ROUTES.contact}`,
    },
    {
      url: `${BASE_URL}${STOREFRONT_ROUTES.dataPolicy}`,
    },
    {
      url: `${BASE_URL}${STOREFRONT_ROUTES.returnsPolicy}`,
    },
    {
      url: `${BASE_URL}${STOREFRONT_ROUTES.shippingPolicy}`,
    },
    {
      url: `${BASE_URL}${STOREFRONT_ROUTES.shop}`,
    },
    {
      url: `${BASE_URL}${STOREFRONT_ROUTES.giftCard}`,
    },
    ...comingSoonUrls,
    ...categoryUrls,
    ...productsUrls,
  ];
}
