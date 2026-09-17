import { OrderItem, Product } from "@/types";

type CartLine = Pick<Product, "id"> & { quantity?: number };

function tally(
  lines: { id: string | null | undefined; quantity: number }[],
): Map<string, number> | null {
  const totals = new Map<string, number>();

  for (const line of lines) {
    if (!line.id) return null;
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    totals.set(line.id, (totals.get(line.id) ?? 0) + quantity);
  }

  return totals;
}

/**
 * ¿El carrito que quedó en este navegador es exactamente lo que se acaba de
 * pagar? Sirve para vaciarlo cuando el pago volvió por otro navegador y ya no
 * queda rastro del pedido pendiente.
 *
 * Se exige coincidencia completa —los mismos productos y las mismas
 * cantidades, sin sobras de ningún lado—; un parecido parcial no alcanza.
 */
export function cartMatchesOrder(
  cartItems: CartLine[],
  orderItems: OrderItem[],
): boolean {
  if (cartItems.length === 0 || orderItems.length === 0) return false;

  const cart = tally(
    cartItems.map((item) => ({ id: item.id, quantity: item.quantity ?? 1 })),
  );
  const order = tally(
    orderItems.map((item) => ({
      id: item.product?.id ?? item.productId,
      quantity: item.quantity,
    })),
  );

  if (!cart || !order || cart.size !== order.size) return false;

  return Array.from(cart.keys()).every(
    (productId) => order.get(productId) === cart.get(productId),
  );
}
