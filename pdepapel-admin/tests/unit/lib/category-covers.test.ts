import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: { OPENAI_API_KEY: "test-key" } }));
vi.mock("@/lib/prismadb", () => ({ default: { category: { findFirst: mocks.findFirst, update: mocks.update } } }));
vi.mock("@/lib/cloudinary", () => ({ default: { v2: { uploader: { upload: mocks.upload } } } }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: mocks.revalidate }));

import { buildCoverPrompt, ensureCategoryAssets } from "@/lib/category-covers";

const fetchImpl = vi.fn(async (url: string) => {
  const body = String(url).endsWith("images/generations")
    ? { data: [{ b64_json: Buffer.from("png").toString("base64") }] }
    : { choices: [{ message: { content: "«Cuadernos bonitos para tus apuntes y tus ideas.»" } }] };
  return { ok: true, status: 200, json: async () => body } as Response;
}) as unknown as typeof fetch;

describe("category covers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ id: "cat-1", name: "📓 Cuadernos", slug: "cuadernos", imageUrl: null, seoIntro: null, type: { name: "✏️ Papelería" } });
    mocks.update.mockResolvedValue({});
    mocks.upload.mockResolvedValue({ secure_url: "https://res.cloudinary.com/demo/category-covers/cuadernos.png" });
    mocks.revalidate.mockResolvedValue(undefined);
  });

  it("builds the prompt without taxonomy icons", () => {
    expect(buildCoverPrompt("📓 Cuadernos", "✏️ Papelería")).toContain('Category: "Cuadernos" (Papelería)');
  });

  it("generates and saves both assets when the category has none", async () => {
    const result = await ensureCategoryAssets("store-1", "cat-1", { fetchImpl });
    expect(result.generated).toEqual(["imageUrl", "seoIntro"]);
    expect(result.seoIntro).toBe("Cuadernos bonitos para tus apuntes y tus ideas.");
    expect(mocks.upload).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/), expect.objectContaining({ folder: "category-covers" }));
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "cat-1" },
      data: { imageUrl: "https://res.cloudinary.com/demo/category-covers/cuadernos.png", seoIntro: "Cuadernos bonitos para tus apuntes y tus ideas." },
    });
    expect(mocks.revalidate).toHaveBeenCalledWith(expect.objectContaining({ paths: expect.arrayContaining(["/categoria/cuadernos"]) }));
  });

  it("keeps existing assets untouched unless forced", async () => {
    mocks.findFirst.mockResolvedValue({ id: "cat-1", name: "Cuadernos", slug: "cuadernos", imageUrl: "https://x/y.png", seoIntro: "Ya tiene", type: null });
    const result = await ensureCategoryAssets("store-1", "cat-1", { fetchImpl });
    expect(result.generated).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();

    const forced = await ensureCategoryAssets("store-1", "cat-1", { fetchImpl, force: true });
    expect(forced.generated).toEqual(["imageUrl", "seoIntro"]);
  });

  it("surfaces OpenAI errors instead of saving partial data", async () => {
    const failing = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "quota" } }) })) as unknown as typeof fetch;
    await expect(ensureCategoryAssets("store-1", "cat-1", { fetchImpl: failing })).rejects.toThrow("quota");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
