import { authMiddleware } from "@clerk/nextjs";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";

import { legacyProductRedirects } from "./lib/legacy-product-redirects.mjs";

const legacyProductRedirectByPath = new Map(
  legacyProductRedirects.map(({ source, destination }) => [
    source,
    destination,
  ]),
);

const clerkMiddleware = authMiddleware({
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

export default function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  const destinationPath = legacyProductRedirectByPath.get(
    request.nextUrl.pathname,
  );

  if (destinationPath) {
    const destinationUrl = request.nextUrl.clone();
    destinationUrl.pathname = destinationPath;
    return NextResponse.redirect(destinationUrl, 308);
  }

  return clerkMiddleware(request, event);
}

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
