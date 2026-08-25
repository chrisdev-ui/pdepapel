import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({
  env: { NEXT_PUBLIC_API_URL: "https://admin.example.com/api/store-id" },
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(callback: T) => callback };
});

import { getCategory } from "@/actions/get-category";
import { getOrder } from "@/actions/get-order";
import { getProduct } from "@/actions/get-product";
import { UpstreamServiceError } from "@/lib/upstream-service-error";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("upstream catalog resource errors", () => {
  it("requests product detail through the storefront scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "product-id" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getProduct("product-id");

    const [requestUrl] = fetchMock.mock.calls[0] as [string];
    expect(new URL(requestUrl).searchParams.get("scope")).toBe("storefront");
  });

  it.each([
    ["product", () => getProduct("product-id")],
    ["category", () => getCategory("category-id")],
    ["order", () => getOrder("order-id")],
  ])("returns null only when the %s does not exist", async (_resource, load) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(load()).resolves.toBeNull();
  });

  it.each([
    ["product", () => getProduct("unavailable-product")],
    ["category", () => getCategory("unavailable-category")],
    ["order", () => getOrder("unavailable-order")],
  ])("does not turn a %s service failure into a false 404", async (_resource, load) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    await expect(load()).rejects.toBeInstanceOf(UpstreamServiceError);
  });
});
