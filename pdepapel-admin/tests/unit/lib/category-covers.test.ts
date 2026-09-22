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

/**
 * La llamada de SEO y la de la intro van al mismo endpoint de chat, así que
 * se distinguen por el cuerpo: la de SEO pide `response_format` JSON.
 */
const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
  if (String(url).endsWith("images/generations")) {
    return okJson({ data: [{ b64_json: Buffer.from("png").toString("base64") }] });
  }
  const enviado = JSON.parse(String(init?.body ?? "{}")) as { response_format?: unknown };
  if (enviado.response_format) {
    return okJson({
      choices: [
        {
          message: {
            content: JSON.stringify({
              titulo: "Cuadernos kawaii para tus apuntes",
              descripcion: "Cuadernos de tapa dura y blanda para clase, trabajo y diario, con envíos a toda Colombia.",
            }),
          },
        },
      ],
    });
  }
  return okJson({ choices: [{ message: { content: "«Cuadernos bonitos para tus apuntes y tus ideas.»" } }] });
}) as unknown as typeof fetch;

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe("category covers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ id: "cat-1", name: "📓 Cuadernos", slug: "cuadernos", imageUrl: null, seoIntro: null, seoTitle: null, seoDescription: null, type: { name: "✏️ Papelería" } });
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
    mocks.findFirst.mockResolvedValue({ id: "cat-1", name: "Cuadernos", slug: "cuadernos", imageUrl: "https://x/y.png", seoIntro: "Ya tiene", seoTitle: "Ya tiene", seoDescription: "Ya tiene", type: null });
    const result = await ensureCategoryAssets("store-1", "cat-1", { fetchImpl });
    expect(result.generated).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();

    const forced = await ensureCategoryAssets("store-1", "cat-1", { fetchImpl, force: true });
    expect(forced.generated).toEqual(["imageUrl", "seoIntro"]);
  });

  /**
   * El par de metadatos SEO: los dos campos que el panel no sabía proponer y
   * que más cuesta escribir a mano —cuánto miden y que la tienda ya le pega
   * la marca detrás al título—.
   */
  describe("metadatos SEO", () => {
    it("propone título y descripción juntos y los guarda", async () => {
      const result = await ensureCategoryAssets("store-1", "cat-1", { fetchImpl, part: "seo" });

      expect(result.generated).toEqual(["seoTitle", "seoDescription"]);
      expect(result.seoTitle).toBe("Cuadernos kawaii para tus apuntes");
      expect(result.seoDescription).toContain("envíos a toda Colombia");
      expect(mocks.update).toHaveBeenCalledWith({
        where: { id: "cat-1" },
        data: {
          seoTitle: "Cuadernos kawaii para tus apuntes",
          seoDescription: "Cuadernos de tapa dura y blanda para clase, trabajo y diario, con envíos a toda Colombia.",
        },
      });
    });

    it("no toca la portada ni la intro cuando solo se piden los metadatos", async () => {
      await ensureCategoryAssets("store-1", "cat-1", { fetchImpl, part: "seo" });
      expect(mocks.upload).not.toHaveBeenCalled();
      // Una sola llamada, la de los metadatos: la intro no se pide de rebote.
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("`both` sigue siendo portada e intro, sin metadatos", async () => {
      const result = await ensureCategoryAssets("store-1", "cat-1", { fetchImpl });
      expect(result.generated).toEqual(["imageUrl", "seoIntro"]);
      expect(result.seoTitle).toBeNull();
    });

    it("recorta lo que se pase del tope de la columna", async () => {
      const largo = vi.fn(async (url: string) =>
        okJson({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  titulo: "Cuadernos y agendas kawaii para estudiantes universitarios en toda Colombia con envío",
                  descripcion: "Encuentra de todo. ".repeat(20),
                }),
              },
            },
          ],
        }),
      ) as unknown as typeof fetch;

      const result = await ensureCategoryAssets("store-1", "cat-1", { fetchImpl: largo, part: "seo" });

      // `VarChar(70)` y `VarChar(170)`: pasarse no trunca, rompe la escritura.
      expect(result.seoTitle!.length).toBeLessThanOrEqual(70);
      expect(result.seoDescription!.length).toBeLessThanOrEqual(170);
      expect(result.seoTitle).not.toMatch(/\s$/);
    });

    /**
     * El botón «Completar sección con IA»: una sola petición para portada,
     * intro, título y descripción, en vez de tres viajes seguidos.
     */
    describe("la sección completa («all»)", () => {
      it("rellena las cuatro cosas de una sola vez", async () => {
        const result = await ensureCategoryAssets("store-1", "cat-1", { fetchImpl, part: "all" });

        expect(result.generated).toEqual(["imageUrl", "seoIntro", "seoTitle", "seoDescription"]);
        expect(result.imageUrl).toContain("category-covers");
        expect(result.seoIntro).toBe("Cuadernos bonitos para tus apuntes y tus ideas.");
        expect(result.seoTitle).toBe("Cuadernos kawaii para tus apuntes");
        // Una sola escritura con todo junto, no cuatro sueltas.
        expect(mocks.update).toHaveBeenCalledTimes(1);
      });

      it("sin forzar, respeta lo que ya está y solo completa lo que falta", async () => {
        mocks.findFirst.mockResolvedValue({
          id: "cat-1",
          name: "Cuadernos",
          slug: "cuadernos",
          imageUrl: "https://x/y.png",
          seoIntro: "Ya tiene intro",
          seoTitle: null,
          seoDescription: null,
          type: null,
        });

        const result = await ensureCategoryAssets("store-1", "cat-1", { fetchImpl, part: "all" });

        expect(result.generated).toEqual(["seoTitle", "seoDescription"]);
        // Lo caro es la imagen: si ya está, no se vuelve a pedir.
        expect(mocks.upload).not.toHaveBeenCalled();
        expect(result.imageUrl).toBe("https://x/y.png");
        expect(result.seoIntro).toBe("Ya tiene intro");
      });

      it("con todo lleno y sin forzar, no llama a la IA ni escribe", async () => {
        mocks.findFirst.mockResolvedValue({
          id: "cat-1",
          name: "Cuadernos",
          slug: "cuadernos",
          imageUrl: "https://x/y.png",
          seoIntro: "Ya",
          seoTitle: "Ya",
          seoDescription: "Ya",
          type: null,
        });

        const result = await ensureCategoryAssets("store-1", "cat-1", { fetchImpl, part: "all" });

        expect(result.generated).toEqual([]);
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
      });
    });

    it("si la IA no contesta un JSON legible, no guarda nada", async () => {
      const roto = vi.fn(async () => okJson({ choices: [{ message: { content: "lo siento, no puedo" } }] })) as unknown as typeof fetch;
      await expect(
        ensureCategoryAssets("store-1", "cat-1", { fetchImpl: roto, part: "seo" }),
      ).rejects.toThrow(/JSON/);
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it("si viene un campo vacío, tampoco guarda a medias", async () => {
      const vacio = vi.fn(async () =>
        okJson({ choices: [{ message: { content: JSON.stringify({ titulo: "", descripcion: "algo" }) } }] }),
      ) as unknown as typeof fetch;
      await expect(
        ensureCategoryAssets("store-1", "cat-1", { fetchImpl: vacio, part: "seo" }),
      ).rejects.toThrow(/vac/i);
      expect(mocks.update).not.toHaveBeenCalled();
    });
  });

  it("surfaces OpenAI errors instead of saving partial data", async () => {
    const failing = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "quota" } }) })) as unknown as typeof fetch;
    await expect(ensureCategoryAssets("store-1", "cat-1", { fetchImpl: failing })).rejects.toThrow("quota");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
