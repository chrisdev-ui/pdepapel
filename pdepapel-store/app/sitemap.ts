import { getOrders } from "@/actions/get-orders";
import { getProducts } from "@/actions/get-products";
import { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://papeleriapdepapel.com";
  const orders = await getOrders({});
  const { products } = await getProducts({});
  const productsUrls = products?.map((product) => ({
    url: `${baseUrl}/product/${product.id}`,
    lastModified: new Date(),
  }));
  const ordersUrls = orders?.map((order) => ({
    url: `${baseUrl}/order/${order.id}`,
    lastModified: new Date(),
  }));
  return [
    {
      url: baseUrl,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/sign-in`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/sign-up`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/cart`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/checkout`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/policies/data`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/policies/returns`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/policies/shipping`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/shop`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/wishlist`,
      lastModified: new Date(),
    },
    ...productsUrls,
    ...ordersUrls,
  ];
}
