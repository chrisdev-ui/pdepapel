import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  clerkMiddleware: vi.fn(),
  authMiddleware: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  authMiddleware: mocks.authMiddleware.mockReturnValue(mocks.clerkMiddleware),
}));

import middleware, {
  publicApiCorsHeaders,
  publicRoutes,
} from "../../middleware";

describe("authentication middleware", () => {
  beforeEach(() => {
    mocks.clerkMiddleware.mockReset();
  });

  it("keeps localized Clerk routes public", () => {
    expect(publicRoutes).toEqual([
      "/api/:path*",
      "/iniciar-sesion(.*)",
      "/crear-cuenta(.*)",
    ]);
    expect(mocks.authMiddleware).toHaveBeenCalledWith({
      publicRoutes,
      signInUrl: "/iniciar-sesion",
    });
  });

  it("adds CORS headers to every API response", async () => {
    mocks.clerkMiddleware.mockResolvedValue(new Response(null));

    const response = await middleware(
      new NextRequest("https://admin.example.com/api/store-id/products"),
      {} as never,
    );

    expect(response?.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response?.headers.get("Access-Control-Allow-Methods")).toBe(
      publicApiCorsHeaders["Access-Control-Allow-Methods"],
    );
  });

  it("handles API preflight requests before a route handler", async () => {
    const response = await middleware(
      new NextRequest("https://admin.example.com/api/store-id/products", {
        method: "OPTIONS",
        headers: {
          Origin: "https://papeleriapdepapel.com",
          "Access-Control-Request-Method": "PATCH",
        },
      }),
      {} as never,
    );

    expect(response?.status).toBe(204);
    expect(response?.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(mocks.clerkMiddleware).not.toHaveBeenCalled();
  });

  it("does not add API CORS headers to dashboard pages", async () => {
    mocks.clerkMiddleware.mockResolvedValue(new Response(null));

    const response = await middleware(
      new NextRequest("https://admin.example.com/store-id/productos"),
      {} as never,
    );

    expect(response?.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
});
