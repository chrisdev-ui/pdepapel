import { Product } from "@/types";

export type ActivePresale = NonNullable<Product["presales"]>[number];

/** La preventa que está vendiendo ahora mismo, si la hay. */
export function getActivePresale(
  product: Pick<Product, "presales"> | null | undefined,
): ActivePresale | null {
  return product?.presales?.[0] ?? null;
}

/** ¿Esta línea se paga hoy y llega después? */
export function isPresaleItem(
  product: Pick<Product, "presales"> | null | undefined,
): boolean {
  return getActivePresale(product) !== null;
}

/**
 * Cuántas unidades puede aceptar el carrito hoy.
 *
 * Sin preventa es el stock, como siempre. Con preventa es el cupo que queda,
 * porque la gracia de la preventa es cobrar SIN mercancía en bodega: mirar el
 * stock (que es 0, o casi) dejaba el botón «Reservar ahora» sin efecto y el
 * producto fuera del carrito, que es justo lo contrario de lo que promete la
 * ficha.
 *
 * Es el único número que deben mirar el carrito, la ficha y el checkout para
 * decidir cuánto se puede llevar la clienta.
 */
export function getPurchasableUnits(
  product: Pick<Product, "stock" | "presales">,
): number {
  const presale = getActivePresale(product);
  if (presale) {
    // Lo apartado por pedidos que aún no se pagan cuenta como vendido: no
    // siempre viene (el catálogo cacheado no lo trae), y entonces es 0.
    const taken = presale.committedUnits + (presale.heldUnits ?? 0);
    return Math.max(0, presale.unitLimit - taken);
  }
  return Math.max(0, Number(product.stock) || 0);
}
