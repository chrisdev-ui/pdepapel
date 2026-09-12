import { NextFetchEvent, NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  userId: null as string | null,
  handlerCalls: 0,
}));

// clerkMiddleware needs Clerk keys and request headers we do not have in a
// unit test: replace it with a shim that runs our handler with a fake auth().
vi.mock("@clerk/nextjs/server", async () => {
  const { NextResponse } = await import("next/server");
  return {
    createRouteMatcher: (patterns: string[]) => {
      const regexes = patterns.map((pattern) => new RegExp(`^${pattern}$`));
      return (request: NextRequest) =>
        regexes.some((regex) => regex.test(request.nextUrl.pathname));
    },
    clerkMiddleware:
      (
        handler: (
          auth: () => Promise<{ userId: string | null }>,
          request: NextRequest,
        ) => Promise<Response | void>,
      ) =>
      async (request: NextRequest) => {
        clerk.handlerCalls += 1;
        const response = await handler(
          async () => ({ userId: clerk.userId }),
          request,
        );
        return response ?? NextResponse.next();
      },
  };
});

import middleware from "@/middleware";

const run = (path: string) =>
  middleware(
    new NextRequest(`https://papeleriapdepapel.com${path}`),
    {} as NextFetchEvent,
  );

describe("storefront middleware", () => {
  beforeEach(() => {
    clerk.userId = null;
    clerk.handlerCalls = 0;
  });

  it("sends a signed-out visitor from an account page to sign-in with a relative redirect_url", async () => {
    const response = await run("/mis-pedidos");

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe(
      "https://papeleriapdepapel.com/iniciar-sesion?redirect_url=%2Fmis-pedidos",
    );
  });

  it("keeps the query string of the protected page in the redirect", async () => {
    const response = await run("/mis-busquedas?orden=recientes");

    expect(response?.headers.get("location")).toBe(
      "https://papeleriapdepapel.com/iniciar-sesion?redirect_url=%2Fmis-busquedas%3Forden%3Drecientes",
    );
  });

  it("protects the account hub", async () => {
    const response = await run("/mi-cuenta/direcciones");

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toContain(
      "redirect_url=%2Fmi-cuenta%2Fdirecciones",
    );
  });

  it("lets a signed-in customer through", async () => {
    clerk.userId = "user_1";
    const response = await run("/mis-pedidos");

    expect(response?.status).toBe(200);
    expect(clerk.handlerCalls).toBe(1);
  });

  it("runs Clerk on the pages that read the session on the server without redirecting", async () => {
    for (const path of ["/finalizar-compra", "/iniciar-sesion", "/crear-cuenta/sso-callback"]) {
      clerk.handlerCalls = 0;
      const response = await run(path);
      expect(response?.status, path).toBe(200);
      expect(clerk.handlerCalls, path).toBe(1);
    }
  });

  it("bypasses Clerk on public catalog routes so 404s stay 404s", async () => {
    for (const path of ["/", "/tienda", "/producto/algo", "/politicas/envios"]) {
      const response = await run(path);
      expect(response?.status, path).toBe(200);
    }
    expect(clerk.handlerCalls).toBe(0);
  });

  it("runs Clerk on the order page so the server can send the session token, without protecting it", async () => {
    const response = await run("/pedido/abc");
    expect(response?.status).toBe(200);
    expect(clerk.handlerCalls).toBe(1);
  });

  it("still serves the legacy product redirects first", async () => {
    const { legacyProductRedirects } = await import("@/lib/legacy-product-redirects.mjs");
    const [first] = legacyProductRedirects;
    if (!first) return;

    const response = await run(first.source);
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe(
      `https://papeleriapdepapel.com${first.destination}`,
    );
    expect(clerk.handlerCalls).toBe(0);
  });
});
