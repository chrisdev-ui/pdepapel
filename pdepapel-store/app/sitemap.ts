import { getProducts } from "@/actions/get-products";
import { BASE_URL } from "@/constants";
import { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let productsUrls: MetadataRoute.Sitemap = [];

  try {
    const { products } = await getProducts({
      limit: 1000,
    });
    productsUrls =
      products?.map((product) => ({
        url: `${BASE_URL}/product/${product.id}`,
        lastModified: new Date(),
      })) || [];
  } catch (error) {
    console.warn(
      "Failed to fetch products for sitemap, using static routes only:",
      error,
    );
  }

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
    },
    {
      url: `${BASE_URL}/sign-in`,
      lastModified: new Date(),
    },
    {
      url: `${BASE_URL}/sign-up`,
      lastModified: new Date(),
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: new Date(),
    },
    {
      url: `${BASE_URL}/cart`,
      lastModified: new Date(),
    },
    {
      url: `${BASE_URL}/checkout`,
      lastModified: new Date(),
    },
    {
      url: `${BASE_URL}/contact`,
      lastModified: new Date(),
    },
    {
      url: `${BASE_URL}/policies/data`,
      lastModified: new Date(),
    },
    {
      url: `${BASE_URL}/policies/returns`,
      lastModified: new Date(),
    },
    {
      url: `${BASE_URL}/policies/shipping`,
      lastModified: new Date(),
    },
    {
      url: `${BASE_URL}/shop`,
      lastModified: new Date(),
    },
    {
      url: `${BASE_URL}/wishlist`,
      lastModified: new Date(),
    },
    ...productsUrls,
  ];
}
