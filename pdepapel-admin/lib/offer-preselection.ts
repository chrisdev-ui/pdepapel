/**
 * Productos que llegan ya elegidos al formulario de una oferta nueva.
 *
 * Misma forma que «Duplicar» (`?desde=<idOferta>`): la página lee la dirección,
 * arma una semilla y el formulario la usa como valores iniciales. Aquí lo que
 * viaja es una lista de ids de producto, para que «Crear una oferta» desde
 * Rendimiento o «Poner en oferta» desde Inventario no aterricen en un
 * formulario vacío donde hay que volver a buscar a mano lo que la pantalla
 * anterior ya tenía señalado.
 *
 * Va en la dirección y no en `sessionStorage` por tres razones: es el mismo
 * modismo que `?desde=`, sobrevive a recargar y al botón de atrás, y deja que
 * el servidor valide **antes** de pintar nada. La comprobación de pertenencia
 * no se escribe aquí: `loadScopeProducts` consulta
 * `where: { storeId, id: { in: ids } }`, así que un id de otra tienda —o
 * inventado— simplemente no vuelve. Esto solo filtra la forma.
 */

/**
 * Cuántos ids caben en el enlace.
 *
 * Los ids de producto son UUID (36 caracteres); con las comas, 20 ocupan 739
 * caracteres, y con la ruta y el dominio la dirección queda por debajo de los
 * 900. El límite práctico de los navegadores anda por 2.000, así que 20 deja
 * margen de sobra incluso si algún día los ids crecen. Quien enlaza recorta
 * **antes** y lo dice en la etiqueta: una lista que se recorta en silencio es
 * peor que una que anuncia su tope.
 */
export const OFFER_PRESELECTION_LIMIT = 20;

/** Los ids que pueden existir: lo que generan `uuid()` y `cuid()`, nada más. */
const ID_SHAPE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Lee `?productos=` y devuelve ids con forma de id, sin repetir y como mucho
 * `OFFER_PRESELECTION_LIMIT`. El tope se vuelve a aplicar aquí a propósito:
 * el enlace ya recorta, pero la dirección la puede escribir cualquiera y no
 * hay razón para cargar 500 productos porque alguien los pegó a mano.
 */
export function parsePreselectedProductIds(
  raw: string | string[] | undefined,
): string[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return [];

  const seen = new Set<string>();
  for (const part of value.split(",")) {
    const id = part.trim();
    if (!id || !ID_SHAPE.test(id)) continue;
    seen.add(id);
    if (seen.size === OFFER_PRESELECTION_LIMIT) break;
  }
  return Array.from(seen);
}

/**
 * El enlace a «oferta nueva» con estos productos ya elegidos.
 * Recorta a `OFFER_PRESELECTION_LIMIT`; quien llama decide qué entra primero
 * y lo refleja en el texto del enlace.
 */
export function buildOfferPreselectionHref(
  storeId: string,
  productIds: string[],
): string {
  const ids = productIds.slice(0, OFFER_PRESELECTION_LIMIT);
  if (ids.length === 0) return `/${storeId}/ofertas/nuevo`;
  return `/${storeId}/ofertas/nuevo?productos=${ids.join(",")}`;
}
