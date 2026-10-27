import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type AuthFn = () => Promise<{
  userId: string | null;
  redirectToSignIn: (options?: { returnBackUrl?: string }) => Response;
}>;

const mocks = vi.hoisted(() => ({
  redirectToSignIn: vi.fn(),
  userId: null as string | null,
  handler: null as ((auth: AuthFn, request: NextRequest) => Promise<Response | void>) | null,
  options: null as Record<string, unknown> | null,
}));

vi.mock("@clerk/nextjs/server", async () => {
  const { NextResponse } = await import("next/server");
  return {
    createRouteMatcher: (patterns: string[]) => {
      const regexes = patterns.map((pattern) => new RegExp(`^${pattern}$`));
      return (request: NextRequest) =>
        regexes.some((regex) => regex.test(request.nextUrl.pathname));
    },
    clerkMiddleware: (
      handler: typeof mocks.handler,
      options: Record<string, unknown>,
    ) => {
      mocks.handler = handler;
      mocks.options = options;
      return async (request: NextRequest) => {
        const auth: AuthFn = async () => ({
          userId: mocks.userId,
          redirectToSignIn: mocks.redirectToSignIn,
        });
        const result = await handler!(auth, request);
        return result ?? NextResponse.next();
      };
    },
  };
});

import { getMiddlewareMatchers } from "next/dist/build/analysis/get-page-static-info";

import middleware, {
  config,
  isFileProbePath,
  publicApiCorsHeaders,
  publicRoutes,
} from "../../middleware";

const run = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  middleware(new NextRequest(`https://admin.example.com${path}`, init), {} as never);

describe("authentication middleware", () => {
  beforeEach(() => {
    mocks.redirectToSignIn.mockReset();
    mocks.redirectToSignIn.mockImplementation(
      () => new Response(null, { status: 307, headers: { location: "/iniciar-sesion" } }),
    );
    mocks.userId = "owner-1";
  });

  it("keeps the API and the localized Clerk routes public", () => {
    expect(publicRoutes).toEqual([
      "/api(.*)",
      "/iniciar-sesion(.*)",
      "/sin-acceso(.*)",
      // Aceptar una invitación ocurre sin sesión; la página exige el billete.
      "/aceptar-invitacion(.*)",
      // El service worker y el manifiesto de los avisos push.
      "/sw.js",
      "/manifest.webmanifest",
    ]);
    expect(mocks.options).toEqual({ signInUrl: "/iniciar-sesion" });
  });

  it("requires a session on dashboard pages but not on the API or the auth pages", async () => {
    const signedIn = await run("/store-id/productos");
    expect(signedIn?.status).toBe(200);

    mocks.userId = null;
    const navigation = await run("/store-id/productos", {
      headers: { accept: "text/html", "sec-fetch-dest": "document" },
    });
    expect(navigation?.status).toBe(307);
    expect(mocks.redirectToSignIn).toHaveBeenCalledWith({
      returnBackUrl: "https://admin.example.com/store-id/productos",
    });

    const scripted = await run("/store-id/productos");
    expect(scripted?.status).toBe(401);

    mocks.redirectToSignIn.mockClear();
    for (const path of ["/api/store-id/products", "/iniciar-sesion", "/sin-acceso", "/aceptar-invitacion"]) {
      const response = await run(path, { headers: { accept: "text/html" } });
      expect(response?.status, path).toBe(200);
    }
    expect(mocks.redirectToSignIn).not.toHaveBeenCalled();
  });

  it("adds CORS headers to every API response", async () => {
    const response = await run("/api/store-id/products", {
      headers: { Origin: "https://papeleriapdepapel.com" },
    });

    expect(response?.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://papeleriapdepapel.com",
    );
    expect(response?.headers.get("Access-Control-Allow-Methods")).toBe(
      publicApiCorsHeaders["Access-Control-Allow-Methods"],
    );
  });

  it("handles API preflight requests before Clerk and before a route handler", async () => {
    const response = await run("/api/store-id/products", {
      method: "OPTIONS",
      headers: {
        Origin: "https://papeleriapdepapel.com",
        "Access-Control-Request-Method": "PATCH",
      },
    });

    expect(response?.status).toBe(204);
    expect(response?.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://papeleriapdepapel.com",
    );
    expect(response?.headers.get("Access-Control-Allow-Headers")).toContain(
      "Idempotency-Key",
    );
    expect(mocks.redirectToSignIn).not.toHaveBeenCalled();
  });

  it("does not add API CORS headers to dashboard pages", async () => {
    const response = await run("/store-id/productos");

    expect(response?.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("does not expose API responses to untrusted browser origins", async () => {
    const response = await run("/api/store-id/products", {
      headers: { Origin: "https://example-attacker.com" },
    });

    expect(response?.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
});

describe("rutas de archivo en el panel", () => {
  const STORE_ID = "3f1c2b9e-1d2a-4c6b-9e8f-0a1b2c3d4e5f";
  const matchers = getMiddlewareMatchers(config.matcher, {} as never).map((matcher) => new RegExp(matcher.regexp));
  const reachesMiddleware = (path: string) => matchers.some((regex) => regex.test(path));

  beforeEach(() => {
    mocks.userId = null;
    mocks.redirectToSignIn.mockClear();
  });

  it.each(["/x.php", "/wp-login.php", "/.env", "/xmlrpc.php", "/config.json"])("%s llega al middleware y responde 404 sin pasar por Clerk", async (path) => {
    expect(reachesMiddleware(path)).toBe(true);
    expect(isFileProbePath(path)).toBe(true);
    const response = await run(path, { headers: { accept: "text/html" } });
    expect(response?.status).toBe(404);
    expect(response?.headers.get("x-robots-tag")).toBe("noindex");
    expect(mocks.redirectToSignIn).not.toHaveBeenCalled();
  });

  it.each(["/favicon.ico", "/robots.txt", "/_next/static/chunks/a.js", "/manual/img/a.jpg", "/fonts/mangabey-regular.otf"])(
    "%s sigue sin pasar por el middleware",
    (path) => {
      expect(reachesMiddleware(path)).toBe(false);
    },
  );

  it.each(["/favicon.ico", "/robots.txt", `/${STORE_ID}`, `/${STORE_ID}/pedidos`, "/e2e-admin-store", "/iniciar-sesion", "/sin-acceso", "/api/x/products", "/", "/manual/img/a.jpg"])(
    "%s no es una ruta de archivo",
    (path) => {
      expect(isFileProbePath(path)).toBe(false);
    },
  );

  it.each(["/sw.js", "/manifest.webmanifest"])("%s se sirve sin sesión y sin el 404 de sondeo", async (path) => {
    expect(isFileProbePath(path)).toBe(false);
    const response = await run(path, { headers: { accept: "*/*" } });
    expect(response?.status ?? 200).toBe(200);
    expect(mocks.redirectToSignIn).not.toHaveBeenCalled();
  });

  it("una tienda real y /sign-in siguen el camino normal de Clerk", async () => {
    expect(reachesMiddleware(`/${STORE_ID}`)).toBe(true);
    const page = await run(`/${STORE_ID}`, { headers: { accept: "text/html" } });
    expect(page?.status).toBe(307);
    expect(mocks.redirectToSignIn).toHaveBeenCalledTimes(1);
    const signIn = await run("/sign-in", { headers: { accept: "text/html" } });
    expect(signIn?.status).not.toBe(404);
  });
});
