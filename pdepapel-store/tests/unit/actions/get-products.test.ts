import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({
  env: { NEXT_PUBLIC_API_URL: "https://admin.example.com/api/store-id" },
}));

import { getProducts } from "@/actions/get-products";
import { SORT_OPTIONS } from "@/constants";

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
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(emptyCatalogResponse), { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchMock);

      await getProducts({ sortOption: value });

      const [requestUrl] = fetchMock.mock.calls[0] as [string];
      expect(new URL(requestUrl).searchParams.get("sortOption")).toBe(value);
    },
  );

  it("sends the dedicated only-offers filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(emptyCatalogResponse), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getProducts({ isOnSale: true });

    const [requestUrl] = fetchMock.mock.calls[0] as [string];
    expect(new URL(requestUrl).searchParams.get("isOnSale")).toBe("true");
  });

  it("marks unavailable catalog responses instead of treating them as empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    await expect(getProducts({})).resolves.toMatchObject({
      products: [],
      isUnavailable: true,
    });
  });

  it("marks failed catalog requests as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unavailable")));

    await expect(getProducts({})).resolves.toMatchObject({
      products: [],
      isUnavailable: true,
    });
  });
});
