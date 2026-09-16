import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CATALOG_ENDPOINT, fetchCatalogFromClient } from "@/lib/catalog-client";
import {
  buildCatalogSearchParams,
  parseCatalogSearchParams,
  type CatalogQuery,
} from "@/lib/catalog-params";

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("catálogo desde el cliente", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("va por la ruta, no por una server action", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ products: [], totalItems: 0, totalPages: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchCatalogFromClient({ fromShop: true, page: 2 });

    const [url] = fetchMock.mock.calls[0];
    expect(String(url).startsWith(CATALOG_ENDPOINT)).toBe(true);
    expect(String(url)).toContain("fromShop=true");
    expect(String(url)).toContain("page=2");
  });

  /**
   * El fondo del asunto: una server action ignora el signal, así que una
   * consulta vieja seguía ocupando la cola. Aquí tiene que cancelarse.
   */
  it("cancela de verdad cuando React Query aborta la consulta anterior", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    );

    const controller = new AbortController();
    const pending = fetchCatalogFromClient({ fromShop: true }, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("entrega el signal al fetch para que la cancelación sea posible", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ products: [], totalItems: 0, totalPages: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    await fetchCatalogFromClient({ ids: "a,b" }, controller.signal);

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      signal: controller.signal,
    });
  });

  it("un catálogo caído es «no disponible», no una lista vacía", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 502 })));

    await expect(fetchCatalogFromClient({ fromShop: true })).resolves.toMatchObject({
      isUnavailable: true,
      products: [],
    });
  });
});

describe("parámetros del catálogo", () => {
  it("lo que arma el cliente es lo que lee la ruta", () => {
    const query: CatalogQuery = {
      typeId: "t1,t2",
      categoryId: "c1",
      colorId: "col1",
      sizeId: "s1",
      designId: "d1",
      optionValueId: "ov1",
      page: 3,
      itemsPerPage: 24,
      limit: 5,
      minPrice: 1000,
      maxPrice: 50000,
      sortOption: "featuredFirst",
      search: "cuaderno rosa",
      exact: true,
      isOnSale: true,
      isFeatured: true,
      onlyNew: false,
      fromShop: true,
      groupBy: "parents",
      productGroupId: "g1",
      excludeProducts: "p9",
      ids: "p1,p2",
      availability: "all",
    };

    const roundTripped = parseCatalogSearchParams(
      new URLSearchParams(buildCatalogSearchParams(query).toString()),
    );

    expect(roundTripped).toEqual(query);
  });

  it("no inventa filtros cuando no se pidió ninguno", () => {
    expect(
      parseCatalogSearchParams(new URLSearchParams(buildCatalogSearchParams({}).toString())),
    ).toEqual({});
  });

  it("mantiene minPrice=0, que sí es un filtro", () => {
    const params = buildCatalogSearchParams({ minPrice: 0, maxPrice: 0 });
    expect(parseCatalogSearchParams(params)).toEqual({ minPrice: 0, maxPrice: 0 });
  });
});
