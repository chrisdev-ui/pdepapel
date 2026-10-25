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

  it("sends a legacy source whose product was archived to its category with the notice, in one hop", async () => {
    const response = await run("/producto/cajita-de-sellos-capibara-capibara-amarillo-pastel-m?utm_source=x");
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe(
      "https://papeleriapdepapel.com/categoria/sellos-decorativos?utm_source=x#producto-no-disponible",
    );
  });
});

describe("search alias", () => {
  it("answers /tienda?q= with a 308 to the same search under ?search=", async () => {
    const response = await run("/tienda?q=agenda+rosa&utm_source=x");
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe("https://papeleriapdepapel.com/tienda?utm_source=x&search=agenda+rosa");
  });

  it("does not alias other routes", async () => {
    expect((await run("/categoria/stickers?q=rosa"))?.status).not.toBe(308);
  });
});

describe("cached listings", () => {
  const rewriteOf = async (path: string) => (await run(path))?.headers.get("x-middleware-rewrite") ?? null;

  it("serves /tienda and a category without catalog params from the cached copy, dropping the query", async () => {
    expect(await rewriteOf("/tienda")).toBe("https://papeleriapdepapel.com/catalogo-cache/tienda");
    expect(await rewriteOf("/categoria/stickers")).toBe("https://papeleriapdepapel.com/catalogo-cache/categoria/stickers");
    expect(await rewriteOf("/tienda?utm_source=instagram&fbclid=abc")).toBe("https://papeleriapdepapel.com/catalogo-cache/tienda");
  });

  it("keeps filtered, searched, sorted and paginated listings dynamic", async () => {
    for (const path of ["/tienda?colorId=c1", "/tienda?search=agenda", "/tienda?page=2", "/tienda?typeId=t1", "/categoria/stickers?sortOption=priceAsc", "/categoria/stickers?isOnSale=true"]) {
      expect(await rewriteOf(path), path).toBeNull();
    }
  });

  it("keeps a brand filter on the dynamic route instead of the unfiltered cached copy", async () => {
    for (const path of ["/tienda?marca=kiut", "/tienda?marca=kiut,norma&utm_source=x", "/categoria/stickers?marca=kiut", "/marcas/kiut?categoryId=c1"]) {
      expect(await rewriteOf(path), path).toBeNull();
    }
  });

  it("serves a brand page without catalog params from its cached copy, but not the brand index", async () => {
    expect(await rewriteOf("/marcas/kiut")).toBe("https://papeleriapdepapel.com/catalogo-cache/marcas/kiut");
    expect(await rewriteOf("/marcas/kiut?utm_source=instagram")).toBe("https://papeleriapdepapel.com/catalogo-cache/marcas/kiut");
    expect(await rewriteOf("/marcas")).toBeNull();
  });

  it("does not touch other routes", async () => {
    expect(await rewriteOf("/producto/agenda")).toBeNull();
    expect(await rewriteOf("/categoria/stickers/otra")).toBeNull();
  });

  it("sends a direct visit to the cached copy back to the public URL", async () => {
    const response = await run("/catalogo-cache/categoria/stickers?utm_source=x");
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe("https://papeleriapdepapel.com/categoria/stickers?utm_source=x");
    expect((await run("/catalogo-cache/otra-cosa"))?.headers.get("location")).toBe("https://papeleriapdepapel.com/tienda");
  });
});
