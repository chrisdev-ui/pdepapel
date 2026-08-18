import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  signInUrl: "/iniciar-sesion",
  publicRoutes: [
    "/",
    "/producto/:path*",
    "/tienda",
    "/carrito",
    "/nosotros",
    "/contacto",
    "/favoritos",
    "/finalizar-compra",
    "/pedido/:path*",
    "/cotizacion/:path*",
    "/politicas/:path*",
    "/iniciar-sesion(.*)",
    "/crear-cuenta(.*)",
    "/api/:path*",
    "/product/:path*",
    "/shop",
    "/cart",
    "/about",
    "/contact",
    "/wishlist",
    "/checkout",
    "/order/:path*",
    "/quote/:path*",
    "/policies/:path*",
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/:path*",
  ],
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
