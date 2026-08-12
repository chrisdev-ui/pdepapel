import { authMiddleware } from "@clerk/nextjs";
import { NextRequest, NextResponse } from "next/server";
import type { NextFetchEvent } from "next/server";

export const publicRoutes = [
  "/api/:path*",
  "/iniciar-sesion(.*)",
  "/crear-cuenta(.*)",
];

export const publicApiCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With, X-Guest-Id",
  "Access-Control-Max-Age": "86400",
};

const clerkMiddleware = authMiddleware({
  publicRoutes,
  signInUrl: "/iniciar-sesion",
});

const isApiRequest = (request: NextRequest) =>
  request.nextUrl.pathname.startsWith("/api/");

const applyPublicApiCors = (response: Response) => {
  for (const [header, value] of Object.entries(publicApiCorsHeaders)) {
    response.headers.set(header, value);
  }

  return response;
};

export default async function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  if (isApiRequest(request) && request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: publicApiCorsHeaders,
    });
  }

  const response = await clerkMiddleware(request, event);

  if (!isApiRequest(request)) {
    return response;
  }

  return applyPublicApiCors(response ?? NextResponse.next());
}

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
