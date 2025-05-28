import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/order/", "/orders/"],
    },
    sitemap: "https://papeleriapdepapel.com/sitemap.xml",
  };
}
