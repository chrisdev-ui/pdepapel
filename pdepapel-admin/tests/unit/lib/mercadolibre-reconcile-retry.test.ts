import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La revisión diaria contra Mercado Libre reintenta UNA vez si Mercado Libre
 * la frena con un 429 (13:00 UTC del 2026-10-10: «local_rate_limited» dejó la
 * corrida entera en «no ok»). Un segundo 429 la deja fallida, como antes.
 */
const mocks = vi.hoisted(() => ({ sellerItems: vi.fn(), request: vi.fn() }));

vi.mock("@/lib/env.mjs", () => ({ env: new Proxy({}, { get: () => "test" }) }));
vi.mock("@/lib/prismadb", () => ({
  default: new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) => {
      if (model === "then") return undefined;
      if (model === "$transaction") return async (work: unknown) => (typeof work === "function" ? (work as (tx: unknown) => unknown)({}) : []);
      return new Proxy({} as Record<string, unknown>, {
        get: (_m, method: string) => {
          if (method.startsWith("findMany")) return async () => [];
          if (method === "count") return async () => 0;
          if (/^(update|create|upsert|delete)/.test(method)) return async () => ({ count: 0 });
          return async () => null;
        },
      });
    },
  }),
}));
vi.mock("@/lib/mercadolibre/import-listings", () => ({ getSellerItemIds: mocks.sellerItems }));
vi.mock("@/lib/mercadolibre/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mercadolibre/client")>()),
  requestMercadoLibreJson: mocks.request,
}));
vi.mock("@/lib/mercadolibre/item-sync", () => ({ synchronizeMercadoLibreItemStatus: vi.fn() }));
vi.mock("@/lib/mercadolibre/outbox", () => ({
  enqueuePendingMarketplaceOutboxEvents: vi.fn(),
  queueMarketplaceStockSyncEvents: vi.fn(async () => []),
}));

import { MercadoLibreRequestError, toMercadoLibreRequestError } from "@/lib/mercadolibre/client";
import { RECONCILE_RATE_LIMIT_BACKOFF_MS, runMercadoLibreReconcile } from "@/lib/mercadolibre/reconcile-runner";

const connection = { id: "conn-1", sellerId: "seller-1", storeId: "store-1" };
const throttle = () => new Error("local_rate_limited");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  mocks.request.mockResolvedValue({ ok: true, status: 200, payload: { results: [] } });
});

describe("revisión diaria ante un 429", () => {
  it("un 429 y luego bien: reintenta una vez, tras la espera corta, y queda ok", async () => {
    mocks.sellerItems.mockRejectedValueOnce(throttle()).mockResolvedValueOnce([]);
    const sleep = vi.fn(async () => undefined);

    const run = await runMercadoLibreReconcile(connection, { sleep });

    expect(run.outcome).toBe("ok");
    expect(mocks.sellerItems).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(RECONCILE_RATE_LIMIT_BACKOFF_MS);
  });

  it("respeta el Retry-After que manda Mercado Libre", async () => {
    mocks.sellerItems.mockRejectedValueOnce(toMercadoLibreRequestError(429, null, "consulta", { retryAfterSeconds: 7 })).mockResolvedValueOnce([]);
    const sleep = vi.fn(async () => undefined);

    await runMercadoLibreReconcile(connection, { sleep });

    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it("dos 429 seguidos: un solo reintento y queda fallida", async () => {
    mocks.sellerItems.mockRejectedValue(throttle());
    const sleep = vi.fn(async () => undefined);

    const run = await runMercadoLibreReconcile(connection, { sleep });

    expect(run).toEqual({ outcome: "failed", error: "local_rate_limited" });
    expect(mocks.sellerItems).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("otro error no se reintenta", async () => {
    mocks.sellerItems.mockRejectedValue(new MercadoLibreRequestError("caído", 502, 503));
    const sleep = vi.fn(async () => undefined);

    const run = await runMercadoLibreReconcile(connection, { sleep });

    expect(run.outcome).toBe("failed");
    expect(mocks.sellerItems).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("sin presupuesto para esperar no reintenta", async () => {
    mocks.sellerItems.mockRejectedValue(throttle());
    const sleep = vi.fn(async () => undefined);

    await runMercadoLibreReconcile(connection, { sleep, budgetMs: 6_000 });

    expect(sleep).not.toHaveBeenCalled();
    expect(mocks.sellerItems).toHaveBeenCalledTimes(1);
  });
});
