/**
 * Los topes y la limpieza del título y la descripción SEO de una subcategoría.
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
