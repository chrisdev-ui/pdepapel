import { getProductsPrices } from "@/lib/discount-engine";
import { resolveUnitPrice, type PriceTier, type PriceSource } from "@/lib/price-tiers";
import prismadb from "@/lib/prismadb";

/**
 * El precio de una línea, resuelto en el servidor y en un solo lugar.
 *
 * El servidor es la autoridad: el checkout vuelve a calcular lo que cobra sin
 * confiar en lo que mandó el navegador, y el punto de venta le pregunta a esta
 * misma función en vez de multiplicar en el cliente. Que haya una sola cuenta
 * es lo que impide que el cliente vea un precio y se le cobre otro.
 */

export interface PricingInput {
  productId: string;
  quantity: number;
}

export interface PricedLine {
  productId: string;
  quantity: number;
  /** Lo que se cobra por unidad. */
  unitPrice: number;
  /** Precio de lista, para tachar. */
  originalPrice: number;
  /** Lista, oferta o escalera por cantidad. Nunca dos a la vez. */
  source: PriceSource;
  offerLabel: string | null;
  tierMinQuantity: number | null;
  /** `unitPrice × quantity`, ya redondeado a peso. */
  lineTotal: number;
}

/** Los productos que entiende el motor de ofertas. */
type PricingProduct = {
  id: string;
  price: number;
  categoryId: string;
  productGroupId: string | null;
};

const round = (value: number) => Math.round(value * 100) / 100;

/** Escaleras por producto, en una sola consulta. */
export async function getPriceTiersFor(
  productIds: string[],
): Promise<Map<string, PriceTier[]>> {
  const tiers = new Map<string, PriceTier[]>();
  if (productIds.length === 0) return tiers;

  const rows = await prismadb.productPriceTier.findMany({
    where: { productId: { in: Array.from(new Set(productIds)) } },
    select: { productId: true, minQuantity: true, unitPrice: true },
    orderBy: { minQuantity: "asc" },
  });
  for (const row of rows) {
    const list = tiers.get(row.productId) ?? [];
    list.push({ minQuantity: row.minQuantity, unitPrice: row.unitPrice });
    tiers.set(row.productId, list);
  }
  return tiers;
}

/**
 * Resuelve el precio de cada línea: precio de lista, mejor oferta vigente y
 * escalera por cantidad, y se queda con el más bajo de los tres.
 *
 * `products` se puede pasar ya cargado para no repetir la consulta en el
 * checkout, que de todas formas necesita las filas completas.
 */
export async function priceLines(
  storeId: string,
  lines: PricingInput[],
  products?: PricingProduct[],
): Promise<Map<string, PricedLine>> {
  const result = new Map<string, PricedLine>();
  if (lines.length === 0) return result;

  // Una misma referencia puede venir en varias líneas: la escalera se decide
  // por el total pedido del producto, no por cada línea suelta, o comprar
  // «5 + 5» saldría más caro que pedir «10».
  const wanted = new Map<string, number>();
  for (const line of lines) {
    const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
    wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + quantity);
  }
  const productIds = Array.from(wanted.keys());

  const rows =
    products ??
    (await prismadb.product.findMany({
      where: { id: { in: productIds }, storeId },
      select: { id: true, price: true, categoryId: true, productGroupId: true },
    }));

  const [offerPrices, tiersByProduct] = await Promise.all([
    getProductsPrices(rows as any, storeId),
    getPriceTiersFor(productIds),
  ]);

  for (const product of rows) {
    const quantity = wanted.get(product.id);
    if (quantity === undefined) continue;
    const offer = offerPrices.get(product.id);
    const resolved = resolveUnitPrice({
      basePrice: product.price,
      offerPrice: offer && offer.discount > 0 ? offer.price : null,
      offerLabel: offer?.offerLabel ?? null,
      tiers: tiersByProduct.get(product.id) ?? [],
      quantity,
    });
    result.set(product.id, {
      productId: product.id,
      quantity,
      unitPrice: round(resolved.unitPrice),
      originalPrice: round(resolved.originalPrice),
      source: resolved.source,
      offerLabel: resolved.offerLabel,
      tierMinQuantity: resolved.tierMinQuantity,
      lineTotal: round(resolved.unitPrice * quantity),
    });
  }

  return result;
}

/** Atajo de una sola línea, para el punto de venta y la ficha. */
export async function priceOne(
  storeId: string,
  productId: string,
  quantity: number,
): Promise<PricedLine | null> {
  const priced = await priceLines(storeId, [{ productId, quantity }]);
  return priced.get(productId) ?? null;
}
