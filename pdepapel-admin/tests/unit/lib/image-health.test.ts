import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findImages: vi.fn(),
  updateMany: vi.fn(),
  countProducts: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    image: { findMany: mocks.findImages, updateMany: mocks.updateMany },
    product: { count: mocks.countProducts },
  },
}));

import { checkImageUrl, refreshImageHealth } from "@/lib/image-health";

const respond = (status: number) => async () => ({ status, ok: status >= 200 && status < 300 });

describe("image health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 0 });
  });

  it("classifies responses: only 404/410 are broken, errors are unknown", async () => {
    expect(await checkImageUrl("https://res.cloudinary.com/x/a.png", respond(200))).toBe("ok");
    expect(await checkImageUrl("https://res.cloudinary.com/x/a.png", respond(404))).toBe("broken");
    expect(await checkImageUrl("https://res.cloudinary.com/x/a.png", respond(410))).toBe("broken");
    expect(await checkImageUrl("https://res.cloudinary.com/x/a.png", respond(503))).toBe("unknown");
    expect(await checkImageUrl("https://res.cloudinary.com/x/a.png", async () => { throw new Error("net"); })).toBe("unknown");
    expect(await checkImageUrl("not-a-url")).toBe("broken");
  });

  it("falls back to GET when HEAD is refused", async () => {
    const calls: string[] = [];
    const fetchImpl = async (_url: string, init?: { method?: string }) => {
      calls.push(init?.method ?? "GET");
      return init?.method === "HEAD" ? { status: 405, ok: false } : { status: 200, ok: true };
    };
    expect(await checkImageUrl("https://res.cloudinary.com/x/a.png", fetchImpl)).toBe("ok");
    expect(calls).toEqual(["HEAD", "GET"]);
  });

  it("marks newly broken images, repairs recovered ones and leaves unknowns alone", async () => {
    mocks.findImages.mockResolvedValue([
      { id: "gone", url: "https://cdn/gone.png", brokenAt: null },
      { id: "back", url: "https://cdn/back.png", brokenAt: new Date("2026-09-01") },
      { id: "flaky", url: "https://cdn/flaky.png", brokenAt: null },
      { id: "fine", url: "https://cdn/fine.png", brokenAt: null },
    ]);
    const statuses: Record<string, number> = { "https://cdn/gone.png": 404, "https://cdn/back.png": 200, "https://cdn/flaky.png": 500, "https://cdn/fine.png": 200 };
    const report = await refreshImageHealth("store-1", { fetchImpl: async (url) => ({ status: statuses[url], ok: statuses[url] === 200 }), concurrency: 2 });

    expect(report).toEqual({ checked: 4, broken: 1, repaired: 1, unknown: 1 });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["gone"] } }, data: { brokenAt: expect.any(Date) } });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["back"] } }, data: { brokenAt: null } });
  });
});
