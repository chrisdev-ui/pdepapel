import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  findConnection: vi.fn(),
  getJson: vi.fn(),
  inspect: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  verifyStoreOwner: mocks.verifyStoreOwner,
  CACHE_HEADERS: { NO_CACHE: {} },
}));
vi.mock("@/lib/prismadb", () => ({
  default: { marketplaceConnection: { findUnique: mocks.findConnection } },
}));
vi.mock("@/lib/mercadolibre/client", () => ({
  getMercadoLibreJson: mocks.getJson,
}));
vi.mock("@/lib/mercadolibre/category-validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mercadolibre/category-validation")>()),
  inspectMercadoLibreCategory: mocks.inspect,
}));

import { GET } from "@/app/api/[storeId]/marketplaces/mercadolibre/categories/route";
import {
  MAX_CONCURRENT_CATEGORY_INSPECTIONS,
  MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED,
  MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED,
  MERCADOLIBRE_CATEGORY_SERVICE_UNAVAILABLE,
} from "@/lib/mercadolibre/categories";

const params = { storeId: "store-1" };
const request = new Request("http://localhost/api?query=termo%20owala");
const candidates = Array.from({ length: 8 }, (_, index) => ({
  category_id: `MCO${index + 1}`,
  category_name: `Categoría ${index + 1}`,
  domain_id: "MCO-BOTTLES",
  domain_name: "Termos",
}));

function ok(categoryId: string) {
  return { ok: true, categoryId, attributes: null, path: ["Hogar", categoryId] };
}
function failure(categoryId: string, code: string) {
  return { ok: false, categoryId, code, message: `fallo ${categoryId}`, upstreamStatus: 503 };
}

describe("GET /marketplaces/mercadolibre/categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user-1" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
    mocks.findConnection.mockResolvedValue({ id: "conn-1" });
    mocks.getJson.mockResolvedValue(candidates);
  });

  it("caps concurrent inspections and returns the path with each suggestion", async () => {
    let inFlight = 0;
    let peak = 0;
    mocks.inspect.mockImplementation(async (_connectionId: string, categoryId: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return ok(categoryId);
    });

    const response = await GET(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(peak).toBe(MAX_CONCURRENT_CATEGORY_INSPECTIONS);
    expect(body.unavailableCount).toBe(0);
    expect(body.suggestions).toHaveLength(8);
    expect(body.suggestions[0]).toMatchObject({
      categoryId: "MCO1",
      categoryName: "Categoría 1",
      path: ["Hogar", "MCO1"],
    });
  });

  it("drops non-publishable categories silently and counts the ones Mercado Libre could not verify", async () => {
    mocks.inspect.mockImplementation(async (_connectionId: string, categoryId: string) => {
      if (categoryId === "MCO2") return failure(categoryId, MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED);
      if (categoryId === "MCO3" || categoryId === "MCO4") {
        return failure(categoryId, MERCADOLIBRE_CATEGORY_SERVICE_UNAVAILABLE);
      }
      return ok(categoryId);
    });

    const response = await GET(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.suggestions.map((item: { categoryId: string }) => item.categoryId)).toEqual([
      "MCO1", "MCO5", "MCO6", "MCO7", "MCO8",
    ]);
    expect(body.unavailableCount).toBe(2);
  });

  it("fails when nothing could be verified, and always on an expired authorization", async () => {
    mocks.inspect.mockImplementation(async (_c: string, categoryId: string) =>
      failure(categoryId, MERCADOLIBRE_CATEGORY_SERVICE_UNAVAILABLE),
    );
    expect((await GET(request, { params })).status).toBeGreaterThanOrEqual(400);

    mocks.inspect.mockImplementation(async (_c: string, categoryId: string) =>
      categoryId === "MCO5"
        ? failure(categoryId, MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED)
        : ok(categoryId),
    );
    expect((await GET(request, { params })).status).toBe(401);
  });
});
