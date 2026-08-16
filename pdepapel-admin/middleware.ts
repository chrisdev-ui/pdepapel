import { authMiddleware } from "@clerk/nextjs";
import { isAllowedCorsOrigin } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import type { NextFetchEvent } from "next/server";

export const publicRoutes = [
  "/api/:path*",
  "/iniciar-sesion(.*)",
  "/crear-cuenta(.*)",
];

export const publicApiCorsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With, X-Guest-Id",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

const clerkMiddleware = authMiddleware({
  publicRoutes,
  signInUrl: "/iniciar-sesion",
});

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

  const response = await clerkMiddleware(request, event);

  if (!isApiRequest(request)) {
    return response;
  }

  return applyPublicApiCors(request, response ?? NextResponse.next());
}

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
