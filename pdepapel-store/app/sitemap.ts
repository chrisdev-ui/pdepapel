import { getProducts } from "@/actions/get-products";
import { BASE_URL } from "@/constants";
import { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products } = await getProducts({});
  const productsUrls = products?.map((product) => ({
    url: `${BASE_URL}/product/${product.id}`,
    lastModified: new Date(),
  }));
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
