/**
 * Qué lleva escrito un código leído: el QR de una etiqueta, o un SKU/GTIN.
 *
 * Módulo **neutro a propósito**: sin `"use client"`, sin Prisma, sin nada del
 * servidor. Lo leen a la vez el gancho del escáner —que es de cliente— y la
 * ruta de búsqueda —que es de servidor—, y esa es justo la razón de que viva
 * aquí y no dentro del gancho: un ayudante exportado desde un módulo
 * `"use client"` se convierte en referencia de cliente cuando lo importa el
 * servidor, y revienta al ejecutarse, no al compilar.
 *
 * Misma lección que `lib/business-growth-sections.ts` y
 * `lib/conversation-bot-pause.ts`.
 */

/** Lo que imprime el QR de cada etiqueta: `PDP:<id del producto>`. */
export const QR_CODE_PATTERN = /^PDP:([a-z0-9-]+)$/i;

export type ScannedCode = { kind: "id"; value: string } | { kind: "code"; value: string };

/**
 * Distingue el QR de una etiqueta de cualquier otro código.
 *
 * `kind: "id"` solo cuando trae el prefijo; todo lo demás sale como `"code"`
 * y sigue buscándose por SKU y GTIN, como siempre.
 */
export function parseScannedCode(raw: string): ScannedCode | null {
  const code = raw.trim();
  if (!code) return null;
  const match = QR_CODE_PATTERN.exec(code);
  return match ? { kind: "id", value: match[1] } : { kind: "code", value: code };
}

/**
 * El id que lleva dentro un QR de etiqueta, o `null` si el código no es uno.
 *
 * Azúcar para quien solo necesita esa rama —la búsqueda de Vender— sin tener
 * que mirar el `kind`.
 */
export function readScannedProductId(raw: string): string | null {
  const parsed = parseScannedCode(raw);
  return parsed?.kind === "id" ? parsed.value : null;
}
