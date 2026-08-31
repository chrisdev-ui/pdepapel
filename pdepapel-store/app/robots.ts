import { MetadataRoute } from "next";

const PRIVATE_PATHS = [
  "/order/",
  "/orders/",
  "/checkout/",
  "/cart/",
  "/account/",
  "/wishlist/",
  "/my-orders/",
  "/sign-in/",
  "/sign-up/",
  "/api/",
  "/private/",
  "/quote/",
  "/cotizacion/",
  "/pedido/",
  "/finalizar-compra/",
  "/carrito/",
  "/favoritos/",
  "/mis-pedidos/",
  "/iniciar-sesion/",
  "/crear-cuenta/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "Clarity-Bot",
        allow: ["/", "/_next/static/", "/_next/image"],
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: [...PRIVATE_PATHS, "/_next/"],
      },
    ],
    sitemap: "https://papeleriapdepapel.com/sitemap.xml",
  };
}
