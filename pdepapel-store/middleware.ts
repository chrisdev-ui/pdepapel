import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";

import { legacyProductRedirects } from "./lib/legacy-product-redirects.mjs";
import { accountAccessPath, STOREFRONT_ROUTES } from "./lib/routes";

const legacyProductRedirectByPath = new Map(
  legacyProductRedirects.map(({ source, destination }) => [
    source,
    destination,
  ]),
);

/**
 * Routes that need a session on the server. A visitor without one is sent to
 * the sign-in page with a relative, sanitized `redirect_url` (the same helper
 * the header links use), never to Clerk's default absolute-URL redirect.
 */
const isProtectedRoute = createRouteMatcher([
  `${STOREFRONT_ROUTES.myOrders}(.*)`,
  `${STOREFRONT_ROUTES.savedSearches}(.*)`,
  `${STOREFRONT_ROUTES.account}(.*)`,
]);

/**
 * Routes where Clerk must run on the server: the protected ones above plus
 * every page that calls `auth()` / `currentUser()` in a Server Component.
 * Public catalog routes deliberately bypass Clerk so a genuine `notFound()`
 * keeps its HTTP 404 and ISR keeps working; client components still get the
 * session through `<ClerkProvider>`.
 */
const requiresServerAuth = createRouteMatcher([
  `${STOREFRONT_ROUTES.checkout}(.*)`,
  "/checkout(.*)",
  `${STOREFRONT_ROUTES.signIn}(.*)`,
  `${STOREFRONT_ROUTES.signUp}(.*)`,
  "/sign-in(.*)",
  "/sign-up(.*)",
  `${STOREFRONT_ROUTES.myOrders}(.*)`,
  `${STOREFRONT_ROUTES.savedSearches}(.*)`,
  `${STOREFRONT_ROUTES.account}(.*)`,
  // La página del pedido pide el token de sesión en el servidor para que la
  // API sepa si el pedido con cuenta es de quien lo abre. Es dinámica
  // (`revalidate = 0`), así que no pierde nada por pasar por Clerk.
  "/pedido(.*)",
  "/order(.*)",
]);

const withClerk = clerkMiddleware(
  async (auth, request) => {
    if (!isProtectedRoute(request)) return;

    const { userId } = await auth();
    if (userId) return;

    const { pathname, search } = request.nextUrl;
    const signInUrl = new URL(
      accountAccessPath(STOREFRONT_ROUTES.signIn, `${pathname}${search}`),
      request.url,
    );
    return NextResponse.redirect(signInUrl);
  },
  {
    signInUrl: STOREFRONT_ROUTES.signIn,
    signUpUrl: STOREFRONT_ROUTES.signUp,
  },
);

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

  if (!requiresServerAuth(request)) {
    return NextResponse.next();
  }

  return withClerk(request, event);
}

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
