/**
 * Tope de `limit` e `itemsPerPage` en `GET /products`. Sin tope, un
 * `?itemsPerPage=5000` de un rastreador hacía armar el catálogo entero (la
 * rama agrupada carga todo y después corta la página). Ningún llamador del
 * panel ni de la tienda pide más de 60. Lo que pase del tope se recorta, sin
 * error; un valor inválido cuenta como «no viene» (0).
 */
export const MAX_PUBLIC_PAGE_SIZE = 100;

export function clampPublicPageSize(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return 0;
  return Math.min(Math.floor(value), MAX_PUBLIC_PAGE_SIZE);
}
