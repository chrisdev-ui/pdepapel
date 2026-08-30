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
    "/finalizar-compra",
    "/iniciar-sesion(.*)",
    "/crear-cuenta(.*)",
    "/checkout",
    "/sign-in(.*)",
    "/sign-up(.*)",
  ],
});

const requiresServerAuth = (pathname: string) =>
  pathname === "/finalizar-compra" ||
  pathname === "/checkout" ||
  pathname === "/iniciar-sesion" ||
  pathname.startsWith("/iniciar-sesion/") ||
  pathname === "/crear-cuenta" ||
  pathname.startsWith("/crear-cuenta/") ||
  pathname === "/sign-in" ||
  pathname.startsWith("/sign-in/") ||
  pathname === "/sign-up" ||
  pathname.startsWith("/sign-up/");

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

  if (!requiresServerAuth(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return clerkMiddleware(request, event);
}

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
