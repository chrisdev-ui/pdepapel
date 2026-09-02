import { getCategories } from "@/actions/get-categories";
import { getSitemapProducts } from "@/actions/get-sitemap-products";
import { BASE_URL } from "@/constants";
import { categoryPath, productPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { MetadataRoute } from "next";

const getLastModified = (updatedAt?: string) => {
  if (!updatedAt) return undefined;

  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let productsUrls: MetadataRoute.Sitemap = [];
  let categoryUrls: MetadataRoute.Sitemap = [];

  try {
    const products = (await getSitemapProducts()).filter(
      (product) => !product.isArchived,
    );

    productsUrls = products.map((product) => ({
      url: `${BASE_URL}${productPath(product.slug || product.id)}`,
      lastModified: getLastModified(product.updatedAt),
    }));
  } catch (error) {
    console.warn(
      "Failed to fetch products for sitemap, using static routes only:",
      error,
    );
  }

  try {
    const categories = await getCategories();
    categoryUrls = categories
      .filter((category) => category.seoEnabled && category.slug)
      .map((category) => ({
        url: `${BASE_URL}${categoryPath(category.slug!)}`,
      }));
  } catch (error) {
    console.warn("Failed to fetch SEO categories for sitemap:", error);
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
    ...categoryUrls,
    ...productsUrls,
  ];
}
