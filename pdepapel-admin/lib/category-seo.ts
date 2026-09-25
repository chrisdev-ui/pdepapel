/**
 * Los topes y la limpieza del título y la descripción SEO de una subcategoría,
 * y los prompts de portada e intro que comparten el panel y el guion por lotes
 * (`prisma/scripts/category-covers.ts`): una sola copia, para que no se
 * desvíen.
 *
 * Módulo **neutro a propósito**: sin `"use client"`, sin Prisma, sin OpenAI.
 * Lo leen a la vez el formulario —que es de cliente— y `lib/category-covers.ts`
 * —que es de servidor—, y esa es la razón de que viva aquí: un ayudante
 * exportado desde un módulo `"use client"` se convierte en referencia de
 * cliente cuando lo importa el servidor, y revienta al ejecutarse, no al
 * compilar. Misma lección que `lib/scanned-code.ts`.
 */

/** Tope de la columna `Category.seoTitle` (`VarChar(70)`). */
export const CATEGORY_SEO_TITLE_MAX = 70;

/** Tope de la columna `Category.seoDescription` (`VarChar(170)`). */
export const CATEGORY_SEO_DESCRIPTION_MAX = 170;

/**
 * Lo que la tienda le pega detrás al título: `app/layout.tsx` arma el
 * `<title>` con la plantilla `%s | Papelería P de Papel`. Por eso el título
 * bueno es bastante más corto que el tope de la columna —Google corta cerca
 * de 60 caracteres contando el sufijo— y por eso no hay que repetir la marca.
 */
export const CATEGORY_SEO_TITLE_SUFFIX = " | Papelería P de Papel";

/** Largo recomendado del título para que el `<title>` entero no se corte. */
export const CATEGORY_SEO_TITLE_RECOMMENDED = 40;

/** Quita el emoji o icono con el que empieza el nombre de una taxonomía. */
export const stripTaxonomyIcon = (name: string) => name.replace(/^[^A-Za-z0-9À-ɏ]+/, "").trim();

/** Prompt de imagen de las portadas, el mismo para el panel y el guion por lotes. */
export const COVER_STYLE_PROMPT = [
  "Square product photography for a Colombian kawaii stationery shop.",
  "Top-down flat lay on a soft pastel pink or peach paper background, gentle daylight, subtle soft shadows.",
  "A few cute pastel-colored items of the category arranged loosely with small kawaii accents (tiny stars, hearts, a bow, a strawberry) and one or two washi tapes at the edges.",
  "Colors: baby pink, lavender, mint, butter yellow, baby blue. Clean, uncluttered, no text, no logos, no people, no hands, no watermark.",
  "Style of a curated e-commerce category cover: airy, sweet, high quality, 1:1.",
].join(" ");

export function buildCoverPrompt(categoryName: string, typeName: string): string {
  return `${COVER_STYLE_PROMPT} Category: "${stripTaxonomyIcon(categoryName)}" (${stripTaxonomyIcon(typeName)}). Show items that belong to this category.`;
}

/** Voz de las intros de subcategoría; la marca la pone la tienda, no el texto. */
export const INTRO_SYSTEM_PROMPT =
  "Escribes textos cortos para una papelería colombiana en línea (P de Papel, Medellín, envíos a toda Colombia). Tono cercano y alegre, español de Colombia, sin emojis, sin signos de exclamación, sin comillas, sin nombrar la marca. No prometas precios ni stock.";

export function buildIntroUserPrompt(categoryName: string, typeName: string): string {
  return `Escribe la intro de la subcategoría «${stripTaxonomyIcon(categoryName)}» (categoría: ${stripTaxonomyIcon(typeName)}): entre 110 y 160 caracteres, una o dos frases, sobre para qué sirven los productos o a quién le gustan. Devuelve solo el texto.`;
}

/**
 * Deja un texto listo para guardar: sin comillas de adorno, sin saltos y
 * dentro del tope de la columna.
 *
 * Corta por palabra entera, no a la mitad: un modelo se pasa de largo con
 * facilidad y `VarChar(70)` no perdona —MySQL rechazaría la escritura—, así
 * que el recorte va aquí y no en la confianza de que el prompt se obedezca.
 */
export function clampSeoText(value: string, max: number): string {
  const limpio = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["«'']+|["»'']+$/g, "")
    .trim();
  if (limpio.length <= max) return limpio;

  const cortado = limpio.slice(0, max);
  const ultimoEspacio = cortado.lastIndexOf(" ");
  // Si no hay ni un espacio, es una sola palabra larguísima: se corta seco.
  const base = ultimoEspacio > max * 0.6 ? cortado.slice(0, ultimoEspacio) : cortado;
  return base.replace(/[\s,;:.\-–—]+$/, "");
}
