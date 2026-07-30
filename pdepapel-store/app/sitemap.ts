import { getProducts } from "@/actions/get-products";
import { BASE_URL } from "@/constants";
import { MetadataRoute } from "next";

const SITEMAP_PAGE_SIZE = 500;

const getLastModified = (updatedAt?: string) => {
  if (!updatedAt) return undefined;

  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let productsUrls: MetadataRoute.Sitemap = [];

  try {
    const firstPage = await getProducts({
      fromShop: true,
      itemsPerPage: SITEMAP_PAGE_SIZE,
    });
    const remainingPages = await Promise.all(
      Array.from({ length: Math.max(firstPage.totalPages - 1, 0) }, (_, index) =>
        getProducts({
          fromShop: true,
          itemsPerPage: SITEMAP_PAGE_SIZE,
          page: index + 2,
        }),
      ),
    );
    const products = [
      ...firstPage.products,
      ...remainingPages.flatMap((page) => page.products),
    ];

    productsUrls = products.map((product) => ({
      url: `${BASE_URL}/product/${product.slug || product.id}`,
      lastModified: getLastModified(product.updatedAt),
    }));
  } catch (error) {
    console.warn(
      "Failed to fetch products for sitemap, using static routes only:",
      error,
    );
  }

  return [
    {
      url: BASE_URL,
    },
    {
      url: `${BASE_URL}/about`,
    },
    {
      url: `${BASE_URL}/contact`,
    },
    {
      url: `${BASE_URL}/policies/data`,
    },
    {
      url: `${BASE_URL}/policies/returns`,
    },
    {
      url: `${BASE_URL}/policies/shipping`,
    },
    {
      url: `${BASE_URL}/shop`,
    },
    ...productsUrls,
  ];
}
