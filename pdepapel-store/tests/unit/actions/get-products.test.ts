import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({
  env: { NEXT_PUBLIC_API_URL: "https://admin.example.com/api/store-id" },
}));
vi.mock("@/lib/public-env", async () => ({ publicEnv: (await import("@/lib/env.mjs")).env }));

import { getListingProducts, getProducts } from "@/actions/get-products";
import { SORT_OPTIONS } from "@/constants";
import { CACHED_LISTING_PARAMS } from "@/lib/cached-listing";
import { CATALOG_FETCH_CACHE, UPSTREAM_TIMEOUT_MS } from "@/lib/catalog-cache";
import { MAX_CATALOG_PAGE_SIZE } from "@/lib/catalog-params";

const emptyCatalogResponse = {
  products: [],
  totalPages: 0,
  totalItems: 0,
};

describe("getProducts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(SORT_OPTIONS)(
    "sends the %s sort option to the catalog API",
    async ({ value }) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(emptyCatalogResponse), { status: 200 }),
        );
      vi.stubGlobal("fetch", fetchMock);

      await getProducts({ sortOption: value });

      const [requestUrl] = fetchMock.mock.calls[0] as [string];
      expect(new URL(requestUrl).searchParams.get("sortOption")).toBe(value);
    },
  );

  it("sends the dedicated only-offers filter", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(emptyCatalogResponse), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await getProducts({ isOnSale: true });

    const [requestUrl] = fetchMock.mock.calls[0] as [string];
    expect(new URL(requestUrl).searchParams.get("isOnSale")).toBe("true");
  });

  it("uses the shared five-minute catalog cache", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(emptyCatalogResponse), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await getProducts({});

    expect(fetchMock.mock.calls[0][1]).toEqual({ ...CATALOG_FETCH_CACHE, signal: expect.any(AbortSignal) });
  });

  it("tags a category listing with its category, not the general list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(emptyCatalogResponse), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await getProducts({ categoryId: "cat-1", excludeProducts: "p-1", limit: 4 });

    expect(fetchMock.mock.calls[0][1]).toEqual({
      next: { revalidate: 300, tags: ["products", "products:category:cat-1"] },
      signal: expect.any(AbortSignal),
    });
  });

  it("normalizes the bulk product array used by cart stock validation", async () => {
    const products = [{ id: "product-1", stock: 4 }];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(products), { status: 200 }),
        ),
    );

    await expect(getProducts({ ids: "product-1" })).resolves.toMatchObject({
      products,
      totalItems: 1,
      totalPages: 1,
    });
  });

  it("marks malformed successful responses as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
        ),
    );

    await expect(getProducts({})).resolves.toMatchObject({
      products: [],
      isUnavailable: true,
    });
  });

  it("marks unavailable catalog responses instead of treating them as empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    await expect(getProducts({})).resolves.toMatchObject({
      products: [],
      isUnavailable: true,
    });
  });

  it("marks failed catalog requests as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network unavailable")),
    );

    await expect(getProducts({})).resolves.toMatchObject({
      products: [],
      isUnavailable: true,
    });
  });

  describe("tiempo límite y caché ISR (/tienda colgada 300 s, 2026-10-25)", () => {
    /** Un fetch que nunca responde, salvo que su señal se aborte. */
    const hangingFetch = () =>
      vi.fn((_url: URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
      );

    /** La señal del tiempo límite, controlada por la prueba (vitest no adelanta el reloj interno de AbortSignal.timeout). */
    const controlTimeout = () => {
      const controller = new AbortController();
      const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
      return { timeout, fire: () => controller.abort(new DOMException("timeout", "TimeoutError")) };
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("corta a los 8 s, menos que los 10 s de la prueba y que los 30 s de la ruta", () => {
      expect(UPSTREAM_TIMEOUT_MS).toBe(8_000);
      expect(UPSTREAM_TIMEOUT_MS).toBeLessThan(10_000);
    });

    it("un panel colgado da «no disponible» cuando vence el tiempo, con las etiquetas de caché intactas", async () => {
      const fetchMock = hangingFetch();
      vi.stubGlobal("fetch", fetchMock);
      const { timeout, fire } = controlTimeout();

      const pending = getListingProducts({ search: "agenda" }, { categoryId: "cat-1", fromShop: true });
      expect(timeout).toHaveBeenCalledWith(8_000);
      const init = fetchMock.mock.calls[0][1] as RequestInit & { next: unknown };
      expect(init.next).toEqual({ revalidate: 300, tags: ["products", "products:category:cat-1"] });
      expect(init.signal?.aborted).toBe(false);

      fire();
      await expect(pending).resolves.toMatchObject({ products: [], isUnavailable: true });
    });

    it("la copia en caché lanza en vez de guardar «no disponible», así Next sirve la última copia buena", async () => {
      const fetchMock = hangingFetch();
      vi.stubGlobal("fetch", fetchMock);
      const { fire } = controlTimeout();

      const pending = getListingProducts(CACHED_LISTING_PARAMS, { fromShop: true, page: 1 });
      fire();
      await expect(pending).rejects.toThrow("el catálogo");
    });

    it("la copia en caché también lanza con un 503 o una respuesta rota", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
      await expect(getListingProducts(CACHED_LISTING_PARAMS, { fromShop: true })).rejects.toThrow("503");

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ unexpected: true }), { status: 200 })));
      await expect(getListingProducts(CACHED_LISTING_PARAMS, { fromShop: true })).rejects.toThrow("el catálogo");
    });

    it("un objeto vacío cualquiera no es la copia en caché: muestra «no disponible»", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
      await expect(getListingProducts({}, { fromShop: true })).resolves.toMatchObject({ isUnavailable: true });
    });
  });

  it("recorta un itemsPerPage o limit gigante al tope de 60", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(emptyCatalogResponse), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await getProducts({ fromShop: true, itemsPerPage: 5000, limit: 999 });

    const [requestUrl] = fetchMock.mock.calls[0] as [URL];
    expect(MAX_CATALOG_PAGE_SIZE).toBe(60);
    expect(new URL(requestUrl).searchParams.get("itemsPerPage")).toBe("60");
    expect(new URL(requestUrl).searchParams.get("limit")).toBe("60");
  });
});
