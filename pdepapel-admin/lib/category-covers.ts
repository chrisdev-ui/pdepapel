import cloudinary from "@/lib/cloudinary";
import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { getCategoryRevalidationPaths } from "@/lib/category-slugs";
import {
  CATEGORY_SEO_DESCRIPTION_MAX,
  CATEGORY_SEO_TITLE_MAX,
  CATEGORY_SEO_TITLE_RECOMMENDED,
  CATEGORY_SEO_TITLE_SUFFIX,
  INTRO_SYSTEM_PROMPT,
  buildCoverPrompt,
  buildIntroUserPrompt,
  clampSeoText,
  stripTaxonomyIcon,
} from "@/lib/category-seo";

// Los prompts viven en `lib/category-seo.ts`; estos nombres siguen saliendo de
// aquí porque las rutas de tipos y la prueba de portadas los importan así.
export { buildCoverPrompt, stripTaxonomyIcon, COVER_STYLE_PROMPT as STYLE_PROMPT } from "@/lib/category-seo";
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

export function isCategoryCoverConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
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
        { role: "system", content: INTRO_SYSTEM_PROMPT },
        { role: "user", content: buildIntroUserPrompt(categoryName, typeName) },
      ],
    },
    fetchImpl,
  );
  return data.choices[0].message.content.trim().replace(/^["«]|["»]$/g, "");
}

/**
 * Propone el título y la descripción SEO de una subcategoría en una sola
 * llamada.
 *
 * Van juntos a propósito: son el par que ve quien busca en Google y se
 * escriben mirándose —el título promete y la descripción cumple—, así que
 * pedirlos por separado sale más caro y menos coherente.
 *
 * Los dos se recortan al volver: son columnas `VarChar` y el modelo se pasa
 * de largo con facilidad.
 */
export async function generateCategorySeo(
  categoryName: string,
  typeName: string,
  fetchImpl?: FetchLike,
): Promise<{ seoTitle: string; seoDescription: string }> {
  const nombre = stripTaxonomyIcon(categoryName);
  const data = await openAi<{ choices: { message: { content: string } }[] }>(
    "chat/completions",
    {
      model: TEXT_MODEL,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Escribes metadatos SEO para una papelería colombiana en línea (Medellín, envíos a toda Colombia). Español de Colombia, sin emojis, sin signos de exclamación, sin comillas, sin mayúsculas sostenidas. No prometas precios, descuentos ni stock. Responde solo con JSON.",
        },
        {
          role: "user",
          content: [
            `Subcategoría: «${nombre}» (categoría: ${stripTaxonomyIcon(typeName)}).`,
            "Devuelve un JSON con dos claves:",
            `- "titulo": el título de la pestaña del navegador. Alrededor de ${CATEGORY_SEO_TITLE_RECOMMENDED} caracteres y nunca más de ${CATEGORY_SEO_TITLE_MAX}. La tienda le añade después «${CATEGORY_SEO_TITLE_SUFFIX.trim()}», así que no nombres la marca ni la repitas. Empieza por lo que la persona buscaría.`,
            `- "descripcion": el resumen que sale bajo el título en Google. Entre 140 y ${CATEGORY_SEO_DESCRIPTION_MAX} caracteres, una o dos frases, diciendo qué va a encontrar y para qué sirve. Puede mencionar que hay envíos a toda Colombia.`,
          ].join("\n"),
        },
      ],
    },
    fetchImpl,
  );

  const bruto = data.choices[0]?.message?.content ?? "";
  let parsed: { titulo?: unknown; descripcion?: unknown };
  try {
    parsed = JSON.parse(bruto) as { titulo?: unknown; descripcion?: unknown };
  } catch {
    throw new Error("La IA no devolvió un JSON que se pueda leer.");
  }

  const seoTitle = clampSeoText(typeof parsed.titulo === "string" ? parsed.titulo : "", CATEGORY_SEO_TITLE_MAX);
  const seoDescription = clampSeoText(
    typeof parsed.descripcion === "string" ? parsed.descripcion : "",
    CATEGORY_SEO_DESCRIPTION_MAX,
  );
  if (!seoTitle || !seoDescription) throw new Error("La IA devolvió el título o la descripción vacíos.");
  return { seoTitle, seoDescription };
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
  seoTitle: string | null;
  seoDescription: string | null;
  generated: ("imageUrl" | "seoIntro" | "seoTitle" | "seoDescription")[];
}

/**
 * Qué generar:
 *
 * - `cover`: la portada.
 * - `intro`: la intro de la página.
 * - `seo`: el par de metadatos —título y descripción, juntos—.
 * - `all`: la sección entera, en una sola petición.
 * - `both`: portada + intro. Es el valor por defecto y se queda como estaba,
 *   sin el SEO: es lo que contesta el endpoint cuando no le piden nada en
 *   concreto, y meterle una llamada más por defecto encarecería en silencio a
 *   quien ya lo usa. Para la sección completa está `all`.
 */
export type CategoryAssetPart = "cover" | "intro" | "seo" | "all" | "both";

export const CATEGORY_ASSET_PARTS: readonly CategoryAssetPart[] = ["cover", "intro", "seo", "all", "both"];

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
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      seoIntro: true,
      seoTitle: true,
      seoDescription: true,
      type: { select: { name: true } },
    },
  });
  if (!category) throw new Error("La subcategoría no existe en esta tienda.");

  const part = options.part ?? "both";
  const wantsCover = part === "cover" || part === "both" || part === "all";
  const wantsIntro = part === "intro" || part === "both" || part === "all";
  const wantsSeo = part === "seo" || part === "all";
  const generated: CategoryAssetsResult["generated"] = [];
  const data: { imageUrl?: string; seoIntro?: string; seoTitle?: string; seoDescription?: string } = {};
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
  // El par va junto: si falta uno de los dos se piden los dos, porque se
  // escriben mirándose y un título nuevo con la descripción vieja descuadra.
  if (wantsSeo && (options.force || !category.seoTitle || !category.seoDescription)) {
    const seo = await generateCategorySeo(category.name, typeName, options.fetchImpl);
    data.seoTitle = seo.seoTitle;
    data.seoDescription = seo.seoDescription;
    generated.push("seoTitle", "seoDescription");
  }

  if (generated.length > 0) {
    await prismadb.category.update({ where: { id: category.id }, data });
    await triggerStorefrontRevalidation({ paths: getCategoryRevalidationPaths(category.slug), tags: ["categories", "catalog"] });
  }

  return {
    imageUrl: data.imageUrl ?? category.imageUrl,
    seoIntro: data.seoIntro ?? category.seoIntro,
    seoTitle: data.seoTitle ?? category.seoTitle,
    seoDescription: data.seoDescription ?? category.seoDescription,
    generated,
  };
}
