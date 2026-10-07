import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guarda estructural (#6): un GET que lee la sesión (Clerk `auth()`,
 * `getStoreAccess`, `requireStoreRead`, `requireStoreOwner`…) responde datos
 * de quien pregunta y no puede salir con una cabecera de caché pública
 * (`CACHE_HEADERS.STATIC`, `SEMI_STATIC` o `DYNAMIC`): el CDN la serviría a
 * otra persona. El 2026-10-07 había ocho rutas así, más /api/stores.
 *
 * Única excepción: la ficha de producto, que decide la cabecera según haya
 * sesión (pública para la tienda, NO_CACHE para el panel) y tiene su propia
 * prueba de comportamiento en product-detail-cors.test.ts.
 */
const API_ROOT = resolve(__dirname, "../../../app/api");
const SESSION = /\bauth\(\)|\bgetStoreAccess\(|\brequire[A-Z][A-Za-z]*\(|\bverifyStoreOwner\(|\bcurrentUser\(/;
const PUBLIC_CACHE = /CACHE_HEADERS\.(STATIC|SEMI_STATIC|DYNAMIC)\b/;
const ALLOWED = new Set(["[storeId]/products/[productId]/route.ts"]);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });
}

function getHandler(source: string): string | null {
  const start = source.search(/export\s+async\s+function\s+GET\b/);
  if (start < 0) return null;
  const rest = source.slice(start + 1);
  const next = rest.search(/\nexport\s+(async\s+)?function\s+/);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

describe("no public cache on GET handlers that read the session", () => {
  it("finds the API routes", () => {
    expect(routeFiles(API_ROOT).length).toBeGreaterThan(50);
  });

  it("every GET that reads the session answers with NO_CACHE", () => {
    const offenders = routeFiles(API_ROOT)
      .map((path) => ({ path: relative(API_ROOT, path), get: getHandler(readFileSync(path, "utf8")) }))
      .filter(({ path, get }) => get && !ALLOWED.has(path) && SESSION.test(get) && PUBLIC_CACHE.test(get))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
