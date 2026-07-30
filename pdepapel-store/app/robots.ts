import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
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
        "/_next/",
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
      ],
    },
    sitemap: "https://papeleriapdepapel.com/sitemap.xml",
  };
}
