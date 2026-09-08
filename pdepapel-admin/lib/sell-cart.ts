/**
 * Carrito de venta presencial compartido por el punto de venta y las ferias.
 *
 * Una línea es un producto (con tope de unidades: stock o reserva de feria)
 * o una cápsula sorpresa (cantidad fija 1, identificada por su QR). Las
 * funciones son puras: devuelven el nuevo carrito y, si algo no se pudo
 * hacer, un mensaje listo para mostrar.
 */

export type SellPaymentMethod = "CASH" | "BankTransfer";

export interface SellLine {
  /** Identidad de la línea: `product-<id>` o `capsule-<código>`. */
  key: string;
  productId: string | null;
  name: string;
  /** Texto pequeño bajo el nombre: SKU, código de cápsula, disponibilidad. */
  detail?: string;
  price: number;
  quantity: number;
  /** Unidades máximas que se pueden vender; null = sin tope conocido. */
  maxQuantity: number | null;
  imageUrl?: string | null;
  /** La cantidad no se edita (cápsulas). */
  fixedQuantity?: boolean;
}

export interface CartChange {
  cart: SellLine[];
  error?: { title: string; description?: string };
}

export function addLineToCart(cart: SellLine[], line: SellLine): CartChange {
  const existing = cart.find((item) => item.key === line.key);
  if (existing) {
    if (existing.fixedQuantity) {
      return { cart, error: { title: `${existing.name} ya está en la venta`, description: existing.detail ? `Código ${existing.detail}.` : undefined } };
    }
    if (existing.maxQuantity !== null && existing.quantity >= existing.maxQuantity) {
      return {
        cart,
        error: { title: "No hay más unidades disponibles", description: `Solo hay ${existing.maxQuantity} de ${existing.name}.` },
      };
    }
    return { cart: cart.map((item) => (item.key === line.key ? { ...item, quantity: item.quantity + 1, maxQuantity: line.maxQuantity ?? item.maxQuantity } : item)) };
  }
  if (line.maxQuantity !== null && line.maxQuantity <= 0) {
    return { cart, error: { title: "Producto agotado", description: `No quedan unidades de ${line.name}.` } };
  }
  const quantity = Math.max(1, line.quantity || 1);
  return { cart: [...cart, { ...line, quantity: line.maxQuantity !== null ? Math.min(quantity, line.maxQuantity) : quantity }] };
}

export function setLineQuantity(cart: SellLine[], key: string, quantity: number): CartChange {
  const line = cart.find((item) => item.key === key);
  if (!line || line.fixedQuantity) return { cart };
  const wanted = Math.max(1, Math.floor(quantity));
  if (line.maxQuantity !== null && wanted > line.maxQuantity) {
    return {
      cart: cart.map((item) => (item.key === key ? { ...item, quantity: line.maxQuantity as number } : item)),
      error: { title: "Cantidad no disponible", description: `Solo hay ${line.maxQuantity} unidades de ${line.name}.` },
    };
  }
  return { cart: cart.map((item) => (item.key === key ? { ...item, quantity: wanted } : item)) };
}

export function removeLine(cart: SellLine[], key: string): SellLine[] {
  return cart.filter((item) => item.key !== key);
}

export function cartTotals(cart: SellLine[]): { total: number; units: number; lines: number } {
  return cart.reduce(
    (acc, item) => ({ total: acc.total + item.price * item.quantity, units: acc.units + item.quantity, lines: acc.lines + 1 }),
    { total: 0, units: 0, lines: 0 },
  );
}

export function createIdempotencyKey(prefix = "sale"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
