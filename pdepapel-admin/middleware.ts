import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { isAllowedCorsOrigin } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import type { NextFetchEvent } from "next/server";

/**
 * Every API path is public at the middleware: the storefront, webhooks, cron
 * and customers with a bearer token all reach it. Authorization happens inside
 * each handler (`auth()` + `checkIfStoreOwner` for dashboard-only work). The
 * dashboard pages themselves require a session; the layouts then verify that
 * the session owns the store.
 */
export const publicRoutes = [
  "/api(.*)",
  "/iniciar-sesion(.*)",
  "/sin-acceso(.*)",
];

const isPublicRoute = createRouteMatcher(publicRoutes);

export const publicApiCorsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With, X-Guest-Id, Idempotency-Key",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

/** Navigations get a redirect; fetches and scripts get a plain status code. */
const isDocumentRequest = (request: NextRequest) =>
  request.headers.get("sec-fetch-dest") === "document" ||
  (request.headers.get("accept") ?? "").includes("text/html");

const withClerk = clerkMiddleware(
  async (auth, request) => {
    if (isPublicRoute(request)) return;
    const { userId, redirectToSignIn } = await auth();
    if (userId) return;
    // Not `auth.protect()`: for non-browser requests it rewrites to a
    // `/clerk_<id>` path expecting a 404, but here that path matches the
    // `[storeId]` segment and renders the dashboard layout instead.
    if (isDocumentRequest(request)) {
      return redirectToSignIn({ returnBackUrl: request.url });
    }
    return new NextResponse("Inicia sesión para continuar.", { status: 401 });
  },
  { signInUrl: "/iniciar-sesion" },
);

const isApiRequest = (request: NextRequest) =>
  request.nextUrl.pathname.startsWith("/api/");

const applyPublicApiCors = (request: NextRequest, response: Response) => {
  for (const [header, value] of Object.entries(publicApiCorsHeaders)) {
    response.headers.set(header, value);
  }

  const origin = request.headers.get("origin");
  if (isAllowedCorsOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  } else {
    response.headers.delete("Access-Control-Allow-Origin");
  }

  return response;
};

export default async function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  if (isApiRequest(request) && request.method === "OPTIONS") {
    const headers: Record<string, string> = { ...publicApiCorsHeaders };
    const origin = request.headers.get("origin");
    if (isAllowedCorsOrigin(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }

    return new NextResponse(null, {
      status: 204,
      headers,
    });
  }

  const response = await withClerk(request, event);

  if (!isApiRequest(request)) {
    return response;
  }

  return applyPublicApiCors(request, response ?? NextResponse.next());
}

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
