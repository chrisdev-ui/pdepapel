import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    ADMIN_WEB_URL: "https://admin.example.com",
    CRON_SECRET: "cron-secret",
    GOOGLE_MERCHANT_FEED_SECRET: "0123456789abcdef0123456789abcdef" as string | undefined,
    NODE_ENV: "test",
  },
  findProducts: vi.fn(),
  findStores: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: mocks.env }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    product: { findMany: mocks.findProducts },
    store: { findMany: mocks.findStores },
  },
}));
vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ get: mocks.redisGet, set: mocks.redisSet }) },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: {
    NO_CACHE: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  },
  verifyStoreOwner: mocks.verifyStoreOwner,
}));

import { GET as getFeed } from "@/app/api/[storeId]/google-merchant/feed/route";
import {
  GET as getReport,
  POST as refreshReport,
} from "@/app/api/[storeId]/google-merchant/report/route";
import { GET as runCron } from "@/app/api/cron/google-merchant-feed/route";
import { createGoogleMerchantFeedToken } from "@/lib/google-merchant-feed";

const storeId = "store-1";
const params = { params: { storeId } };
const secret = "0123456789abcdef0123456789abcdef";
const token = createGoogleMerchantFeedToken(storeId, secret);
const feedUrl = `https://admin.example.com/api/${storeId}/google-merchant/feed`;

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

describe("hosted Google Merchant feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.env.GOOGLE_MERCHANT_FEED_SECRET = secret;
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSet.mockResolvedValue("OK");
    mocks.findProducts.mockResolvedValue([catalogProduct]);
  });

  it("does not exist while the feed secret is not configured", async () => {
    mocks.env.GOOGLE_MERCHANT_FEED_SECRET = undefined;

    const response = await getFeed(new Request(`${feedUrl}?token=${token}`), params);

    expect(response.status).toBe(404);
    expect(mocks.findProducts).not.toHaveBeenCalled();
  });

  it("rejects a missing, wrong or foreign-store token without touching the catalog", async () => {
    for (const request of [
      new Request(feedUrl),
      new Request(`${feedUrl}?token=not-the-token`),
      new Request(`${feedUrl}?token=${createGoogleMerchantFeedToken("store-2", secret)}`),
    ]) {
      const response = await getFeed(request, params);
      expect(response.status).toBe(403);
    }
    expect(mocks.findProducts).not.toHaveBeenCalled();
  });

  it("serves the cached scheduled build without querying the database", async () => {
    mocks.redisGet.mockImplementation(async (key: string) =>
      key.endsWith(":feed")
        ? "id\ttitle\nCUAD-1\tCuaderno\n"
        : { generatedAt: "2026-09-07T06:00:00.000Z", exportedProducts: 1 },
    );

    const response = await getFeed(
      new Request(feedUrl, {
        headers: {
          authorization: `Basic ${Buffer.from(`merchant:${token}`).toString("base64")}`,
        },
      }),
      params,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/tab-separated-values; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toContain(
      'filename="google-merchant-feed.txt"',
    );
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("last-modified")).toBe(
      "Mon, 07 Sep 2026 06:00:00 GMT",
    );
    await expect(response.text()).resolves.toBe("id\ttitle\nCUAD-1\tCuaderno\n");
    expect(mocks.findProducts).not.toHaveBeenCalled();
  });

  it("builds the feed on demand only when nothing is cached, then caches it", async () => {
    const response = await getFeed(new Request(`${feedUrl}?token=${token}`), params);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body.split("\n")[1]).toContain("CUAD-1\tCuaderno\tRayado\thttps://papeleriapdepapel.com/producto/cuaderno");
    expect(body).toContain("\tin_stock\t");
    expect(mocks.findProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId, isArchived: false, OR: expect.any(Array) }),
      }),
    );
    expect(mocks.redisSet).toHaveBeenCalledWith(
      `store:${storeId}:google-merchant:feed`,
      body,
      { ex: 60 * 60 * 24 * 7 },
    );
  });
});

describe("Google Merchant feed report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.env.GOOGLE_MERCHANT_FEED_SECRET = secret;
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSet.mockResolvedValue("OK");
    mocks.findProducts.mockResolvedValue([catalogProduct]);
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
  });

  it("requires a signed-in store owner", async () => {
    mocks.auth.mockReturnValue({ userId: null });

    const response = await getReport(new Request(`${feedUrl.replace("/feed", "/report")}`), params);

    expect(response.status).toBe(401);
    expect(mocks.verifyStoreOwner).not.toHaveBeenCalled();
  });

  it("exposes the feed URL, schedule and last report to the owner only", async () => {
    mocks.auth.mockReturnValue({ userId: "user-1" });
    mocks.redisGet.mockImplementation(async (key: string) =>
      key.endsWith(":report") ? JSON.stringify({ exportedProducts: 4 }) : "feed",
    );

    const response = await getReport(new Request("https://admin.example.com/x"), params);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.verifyStoreOwner).toHaveBeenCalledWith("user-1", storeId);
    expect(json.configured).toBe(true);
    expect(json.feedUrl).toBe(`${feedUrl}?token=${token}`);
    expect(json.schedule).toContain("8:00");
    expect(json.report).toEqual({ exportedProducts: 4 });
  });

  it("lets the owner refresh the feed on demand", async () => {
    mocks.auth.mockReturnValue({ userId: "user-1" });

    const response = await refreshReport(
      new Request("https://admin.example.com/x", { method: "POST" }),
      params,
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.report.exportedProducts).toBe(1);
    expect(json.cached).toBe(true);
    expect(mocks.redisSet).toHaveBeenCalledTimes(2);
  });
});

describe("Google Merchant feed cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSet.mockResolvedValue("OK");
  });

  const cronRequest = (authorization?: string) =>
    new Request("https://admin.example.com/api/cron/google-merchant-feed", {
      headers: authorization ? { authorization } : {},
    }) as never;

  it("rejects requests without the cron secret", async () => {
    const response = await runCron(cronRequest("Bearer nope"));

    expect(response.status).toBe(403);
    expect(mocks.findStores).not.toHaveBeenCalled();
  });

  it("refreshes every store and keeps going when one fails", async () => {
    mocks.findStores.mockResolvedValue([{ id: "store-1" }, { id: "store-2" }]);
    mocks.findProducts.mockImplementation(async (args: { where: { storeId: string } }) => {
      if (args.where.storeId === "store-2") throw new Error("db down");
      return [catalogProduct];
    });

    const response = await runCron(cronRequest("Bearer cron-secret"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      refreshed: [{ storeId: "store-1", exportedProducts: 1, cached: true }],
      failed: 1,
    });
  });
});
