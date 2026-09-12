import cloudinary from "@/lib/cloudinary";
import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { getCategoryRevalidationPaths } from "@/lib/category-slugs";
import { triggerStorefrontRevalidation } from "@/lib/revalidate-store";

/**
 * Portada e intro de una subcategoría (modelo `Category`), generadas con el
 * mismo estilo pastel de las portadas curadas. Se generan solo a pedido: desde
 * los botones «Generar con IA» del formulario (endpoint
 * `POST /api/[storeId]/categories/[categoryId]/cover`) y desde el script por
 * lotes. Crear una subcategoría nunca espera a OpenAI (auditoría Grupo B).
 */

export const IMAGE_MODEL = "gpt-image-1";
export const TEXT_MODEL = "gpt-4.1-mini";

export const STYLE_PROMPT = [
  "Square product photography for a Colombian kawaii stationery shop.",
  "Top-down flat lay on a soft pastel pink or peach paper background, gentle daylight, subtle soft shadows.",
  "A few cute pastel-colored items of the category arranged loosely with small kawaii accents (tiny stars, hearts, a bow, a strawberry) and one or two washi tapes at the edges.",
  "Colors: baby pink, lavender, mint, butter yellow, baby blue. Clean, uncluttered, no text, no logos, no people, no hands, no watermark.",
  "Style of a curated e-commerce category cover: airy, sweet, high quality, 1:1.",
].join(" ");

export const stripTaxonomyIcon = (name: string) => name.replace(/^[^A-Za-z0-9À-ɏ]+/, "").trim();

export function isCategoryCoverConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

export function buildCoverPrompt(categoryName: string, typeName: string): string {
  return `${STYLE_PROMPT} Category: "${stripTaxonomyIcon(categoryName)}" (${stripTaxonomyIcon(typeName)}). Show items that belong to this category.`;
}

type FetchLike = typeof fetch;

async function openAi<T>(endpoint: string, body: unknown, fetchImpl: FetchLike = fetch): Promise<T> {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY no está configurada");
  const response = await fetchImpl(`https://api.openai.com/v1/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok || data.error) throw new Error(data.error?.message ?? `OpenAI ${response.status}`);
  return data;
}

export async function generateCategoryCover(categoryName: string, typeName: string, fetchImpl?: FetchLike): Promise<Buffer> {
  const data = await openAi<{ data: { b64_json: string }[] }>(
    "images/generations",
    { model: IMAGE_MODEL, prompt: buildCoverPrompt(categoryName, typeName), size: "1024x1024", quality: "medium", n: 1 },
    fetchImpl,
  );
  return Buffer.from(data.data[0].b64_json, "base64");
}

export async function generateCategoryIntro(categoryName: string, typeName: string, fetchImpl?: FetchLike): Promise<string> {
  const data = await openAi<{ choices: { message: { content: string } }[] }>(
    "chat/completions",
    {
      model: TEXT_MODEL,
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content:
            "Escribes textos cortos para una papelería colombiana en línea (P de Papel, Medellín, envíos a toda Colombia). Tono cercano y alegre, español de Colombia, sin emojis, sin signos de exclamación, sin comillas, sin nombrar la marca. No prometas precios ni stock.",
        },
        {
          role: "user",
          content: `Escribe la intro de la subcategoría «${stripTaxonomyIcon(categoryName)}» (categoría: ${stripTaxonomyIcon(typeName)}): entre 110 y 160 caracteres, una o dos frases, sobre para qué sirven los productos o a quién le gustan. Devuelve solo el texto.`,
        },
      ],
    },
    fetchImpl,
  );
  return data.choices[0].message.content.trim().replace(/^["«]|["»]$/g, "");
}

export async function uploadCategoryCover(image: Buffer, slug: string): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const result = await cloudinary.v2.uploader.upload(`data:image/png;base64,${image.toString("base64")}`, {
    folder: "category-covers",
    public_id: `${slug}-${stamp}`,
    overwrite: false,
  });
  return result.secure_url;
}

export interface CategoryAssetsResult {
  imageUrl: string | null;
  seoIntro: string | null;
  generated: ("imageUrl" | "seoIntro")[];
}

/** Qué generar: la portada, la intro o las dos (valor por defecto). */
export type CategoryAssetPart = "cover" | "intro" | "both";

export const CATEGORY_ASSET_PARTS: readonly CategoryAssetPart[] = ["cover", "intro", "both"];

export const isCategoryAssetPart = (value: unknown): value is CategoryAssetPart =>
  typeof value === "string" && (CATEGORY_ASSET_PARTS as readonly string[]).includes(value);

export interface EnsureCategoryAssetsOptions {
  /** Regenera aunque ya exista. */
  force?: boolean;
  /** Parte a completar; por defecto las dos. */
  part?: CategoryAssetPart;
  fetchImpl?: FetchLike;
}

/**
 * Completa lo que falte (foto, intro o ambas según `part`) en una subcategoría
 * y lo guarda. Con `force` regenera aunque exista. Nunca toca lo que ya está
 * si no se pide. Es una llamada lenta (OpenAI + Cloudinary): solo debe
 * ejecutarse desde el endpoint de portada, nunca en el `POST` de creación.
 */
export async function ensureCategoryAssets(
  storeId: string,
  categoryId: string,
  options: EnsureCategoryAssetsOptions = {},
): Promise<CategoryAssetsResult> {
  const category = await prismadb.category.findFirst({
    where: { id: categoryId, storeId },
    select: { id: true, name: true, slug: true, imageUrl: true, seoIntro: true, type: { select: { name: true } } },
  });
  if (!category) throw new Error("La subcategoría no existe en esta tienda.");

  const part = options.part ?? "both";
  const wantsCover = part === "cover" || part === "both";
  const wantsIntro = part === "intro" || part === "both";
  const generated: CategoryAssetsResult["generated"] = [];
  const data: { imageUrl?: string; seoIntro?: string } = {};
  const typeName = category.type?.name ?? "Papelería";

  if (wantsCover && (options.force || !category.imageUrl)) {
    const image = await generateCategoryCover(category.name, typeName, options.fetchImpl);
    data.imageUrl = await uploadCategoryCover(image, category.slug || category.id);
    generated.push("imageUrl");
  }
  if (wantsIntro && (options.force || !category.seoIntro)) {
    data.seoIntro = await generateCategoryIntro(category.name, typeName, options.fetchImpl);
    generated.push("seoIntro");
  }

  if (generated.length > 0) {
    await prismadb.category.update({ where: { id: category.id }, data });
    await triggerStorefrontRevalidation({ paths: getCategoryRevalidationPaths(category.slug), tags: ["categories", "catalog"] });
  }

  return { imageUrl: data.imageUrl ?? category.imageUrl, seoIntro: data.seoIntro ?? category.seoIntro, generated };
}
