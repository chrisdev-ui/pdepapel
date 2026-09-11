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
  "/mi-cuenta/",
  "/mis-pedidos/",
  "/mis-busquedas/",
  "/iniciar-sesion/",
  "/crear-cuenta/",
];

/**
 * Cada combinación de filtros de la tienda es una página distinta para un
 * rastreador y cada una es un render sin caché (SSR → API → base de datos).
 * Con el catálogo canónico en el sitemap, las variantes con query no aportan
 * nada al índice y sí cuestan CPU en Vercel.
 */
const FILTERED_PATHS = ["/tienda?", "/categoria/*?", "/shop?"];

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
        disallow: [...PRIVATE_PATHS, ...FILTERED_PATHS, "/_next/"],
      },
    ],
    sitemap: "https://papeleriapdepapel.com/sitemap.xml",
  };
}
