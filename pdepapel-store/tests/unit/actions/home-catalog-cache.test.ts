import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({
  env: { NEXT_PUBLIC_API_URL: "https://admin.example.com/api/store-id" },
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(callback: T) => callback };
});

import { HOME_CONTENT_CACHE, getHomeContent } from "@/actions/get-home-content";
import { REVIEWS_CACHE, getReviews } from "@/actions/get-reviews";

describe("home content and reviews", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caches both feeds for five minutes under their own tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([getHomeContent(), getReviews(6)]);

    expect(fetchMock).toHaveBeenCalledWith("https://admin.example.com/api/store-id/home-content?live=1", HOME_CONTENT_CACHE);
    expect(fetchMock).toHaveBeenCalledWith("https://admin.example.com/api/store-id/reviews?limit=6", REVIEWS_CACHE);
    expect(HOME_CONTENT_CACHE.next).toEqual({ revalidate: 300, tags: ["home-content"] });
    expect(REVIEWS_CACHE.next).toEqual({ revalidate: 300, tags: ["reviews"] });
  });

  it("degrades to empty content when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));

    await expect(getHomeContent()).resolves.toEqual({ hero: null, campaign: null });
    await expect(getReviews()).resolves.toEqual({ reviews: [], summary: { average: null, count: 0 } });
  });
});
