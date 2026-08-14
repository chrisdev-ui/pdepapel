import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({
  env: { NEXT_PUBLIC_API_URL: "https://admin.example.com/api/store-id" },
}));

import { getBanners } from "@/actions/get-banners";
import { getBillboards } from "@/actions/get-billboards";
import { getMainBanner } from "@/actions/get-main-banner";

const catalogCache = {
  next: { revalidate: 300, tags: ["catalog"] },
};

describe("home catalog content", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the catalog cache policy for visual content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([getBillboards(), getMainBanner(), getBanners()]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options).toEqual(catalogCache);
    }
  });
});
