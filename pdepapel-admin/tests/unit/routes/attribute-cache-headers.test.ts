import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #6: un color editado tardaba hasta una hora en llegar a los filtros de la
 * tienda porque `/colors` (y `/sizes`, `/types`) salían con
 * `s-maxage=3600, stale-while-revalidate=86400` y nada purga el CDN al
 * editarlos. Ahora el tope es de minutos.
 */
const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn().mockResolvedValue({ userId: null }) }));
vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({}, { get: () => "test" }) }));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn() }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    color: { findMany: mocks.findMany },
    size: { findMany: mocks.findMany },
    type: { findMany: mocks.findMany },
  },
}));

import { CACHE_HEADERS } from "@/lib/utils";
import { GET as getColors } from "@/app/api/[storeId]/colors/route";
import { GET as getSizes } from "@/app/api/[storeId]/sizes/route";
import { GET as getTypes } from "@/app/api/[storeId]/types/route";

const params = { params: { storeId: "store-1" } };
const req = (path: string) => new Request(`https://admin.test/api/store-1/${path}`) as never;

describe("public attribute endpoints cache headers", () => {
  beforeEach(() => {
    mocks.findMany.mockReset().mockResolvedValue([]);
  });

  it("STATIC is one minute at the edge with a five-minute stale window", () => {
    expect(CACHE_HEADERS.STATIC["Cache-Control"]).toBe("public, s-maxage=60, stale-while-revalidate=300");
  });

  it.each([
    ["colors", getColors],
    ["sizes", getSizes],
    ["types", getTypes],
  ] as const)("GET /%s answers with the short public cache", async (path, handler) => {
    const response = await (handler as (r: unknown, p: unknown) => Promise<Response>)(req(path), params);
    expect(response.status).toBe(200);
    const header = response.headers.get("Cache-Control") ?? "";
    expect(header).toBe("public, s-maxage=60, stale-while-revalidate=300");
    expect(header).not.toMatch(/s-maxage=3600|86400/);
  });
});
