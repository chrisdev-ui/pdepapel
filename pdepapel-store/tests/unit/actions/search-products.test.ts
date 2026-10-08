import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({
  env: { NEXT_PUBLIC_API_URL: "https://admin.example.com/api/store-id" },
}));

import { searchProducts } from "@/actions/search-products";

describe("searchProducts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["a&b", "a%26b"],
    ["#1", "%231"],
    ["lápiz rosa", "l%C3%A1piz+rosa"],
  ])("codifica «%s» en la URL de sugerencias", async (query, encoded) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await searchProducts(query);

    expect(fetchMock.mock.calls[0][0]).toBe(`https://admin.example.com/api/store-id/search/products?search=${encoded}`);
  });
});
