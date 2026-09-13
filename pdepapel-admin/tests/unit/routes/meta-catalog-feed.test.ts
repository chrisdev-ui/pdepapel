import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    ADMIN_WEB_URL: "https://admin.example.com",
    META_CATALOG_FEED_SECRET: "0123456789abcdef0123456789abcdef" as string | undefined,
    NODE_ENV: "test",
  },
  findProducts: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: mocks.env }));
vi.mock("@/lib/prismadb", () => ({
  default: { product: { findMany: mocks.findProducts } },
}));
vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ get: mocks.redisGet, set: mocks.redisSet }) },
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: {
    NO_CACHE: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  },
}));

import { GET as getFeed } from "@/app/api/[storeId]/meta-catalog/feed/route";
import {
  META_CATALOG_FEED_CACHE_TTL_SECONDS,
  createMetaCatalogFeedToken,
} from "@/lib/meta-catalog-feed";

const storeId = "store-1";
const params = { params: { storeId } };
const secret = "0123456789abcdef0123456789abcdef";
const token = createMetaCatalogFeedToken(storeId, secret);
const feedUrl = `https://admin.example.com/api/${storeId}/meta-catalog/feed`;

const catalogProduct = {
  id: "p1",
  name: "Cuaderno",
  slug: "cuaderno",
  sku: "CUAD-1",
  description: "<p>Rayado</p>",
  price: 18000,
  stock: 2,
  brand: "",
  gtin: null,
  mpn: null,
  hasNoProductIdentifier: true,
  productGroupId: null,
  sizeId: null,
  colorId: null,
  designId: null,
  category: { name: "Cuadernos", type: { name: "Papelería" } },
  color: null,
  design: null,
  size: null,
  productGroup: null,
  images: [{ url: "https://res.cloudinary.com/demo/image/upload/v1/c.png", isMain: true }],
};

describe("hosted Meta catalog feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.env.META_CATALOG_FEED_SECRET = secret;
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSet.mockResolvedValue("OK");
    mocks.findProducts.mockResolvedValue([catalogProduct]);
  });

  it("does not exist while the feed secret is not configured", async () => {
    mocks.env.META_CATALOG_FEED_SECRET = undefined;

    const response = await getFeed(new Request(`${feedUrl}?token=${token}`), params);

    expect(response.status).toBe(404);
    expect(mocks.findProducts).not.toHaveBeenCalled();
  });

  it("rejects a missing, wrong or foreign-store token without touching the catalog", async () => {
    for (const request of [
      new Request(feedUrl),
      new Request(`${feedUrl}?token=not-the-token`),
      new Request(`${feedUrl}?token=${createMetaCatalogFeedToken("store-2", secret)}`),
    ]) {
      const response = await getFeed(request, params);
      expect(response.status).toBe(403);
    }
    expect(mocks.findProducts).not.toHaveBeenCalled();
  });

  it("accepts the token as a bearer header", async () => {
    const response = await getFeed(
      new Request(feedUrl, { headers: { authorization: `Bearer ${token}` } }),
      params,
    );

    expect(response.status).toBe(200);
  });

  it("serves the cached build over basic auth without querying the database", async () => {
    mocks.redisGet.mockImplementation(async (key: string) =>
      key.endsWith(":feed")
        ? "id\ttitle\nCUAD-1\tCuaderno\n"
        : { generatedAt: "2026-09-13T06:00:00.000Z", exportedProducts: 1 },
    );

    const response = await getFeed(
      new Request(feedUrl, {
        headers: {
          authorization: `Basic ${Buffer.from(`meta:${token}`).toString("base64")}`,
        },
      }),
      params,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/tab-separated-values; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toContain(
      'filename="meta-catalog-feed.txt"',
    );
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("last-modified")).toBe(
      "Sun, 13 Sep 2026 06:00:00 GMT",
    );
    await expect(response.text()).resolves.toBe("id\ttitle\nCUAD-1\tCuaderno\n");
    expect(mocks.findProducts).not.toHaveBeenCalled();
  });

  it("builds the feed on demand only when nothing is cached, then caches it", async () => {
    const response = await getFeed(new Request(`${feedUrl}?token=${token}`), params);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body.split("\n")[1]).toContain(
      "CUAD-1\tCuaderno\tRayado\tin stock\tnew\t18000.00 COP\thttps://papeleriapdepapel.com/producto/cuaderno",
    );
    expect(mocks.findProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId, isArchived: false, OR: expect.any(Array) }),
      }),
    );
    expect(mocks.redisSet).toHaveBeenCalledWith(
      `store:${storeId}:meta-catalog:feed`,
      body,
      { ex: META_CATALOG_FEED_CACHE_TTL_SECONDS },
    );
  });

  it("still serves the feed when Redis is unavailable", async () => {
    mocks.redisGet.mockRejectedValue(new Error("redis down"));
    mocks.redisSet.mockRejectedValue(new Error("redis down"));

    const response = await getFeed(new Request(`${feedUrl}?token=${token}`), params);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("in stock");
  });
});
