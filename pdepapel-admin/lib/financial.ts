import { Order, OrderItem, OrderType, PaymentMethod } from "@prisma/client";

import { getAmountDue } from "@/lib/gift-card-amounts";
import { gatewayChannelOf, gatewayFee, type GatewayChannel } from "@/lib/gateway-fees";
import { isKnownTransport } from "@/lib/product-costs";

interface OrderWithItems extends Order {
  orderItems: OrderItem[];
}

export interface FinancialMetrics {
  /** Compra + envío por unidad conocido. */
  totalProductCost: number;
  /** La parte de envío por unidad que ya está en `totalProductCost`. */
  productShippingCost: number;
  /** A alguna línea le faltaba el envío por unidad: la ganancia real puede ser menor. */
  productShippingMissing: boolean;
  /** `null`: comisión desconocida (datáfono). La ganancia se calcula sin ella y el pedido queda marcado. */
  gatewayFee: number | null;
  shippingCost: number;
  netProfit: number;
  profitMarginPct: number;
}

/**
 * El costo unitario de un producto. Un kit no tiene costo propio: lo que
 * cuesta es armarlo, es decir la suma del `acqPrice` de sus componentes por la
 * cantidad que lleva cada uno. Es la misma regla que aplica el punto de venta
 * (`lib/point-of-sale.ts › getOrderItemCost`); si las dos difieren, la misma
 * venta queda con margen distinto segun el canal.
 */
export function getProductUnitCost(product: {
  acqPrice: number | null;
  isKit?: boolean | null;
  kitComponents?: {
    quantity: number;
    component: { acqPrice: number | null } | null;
  }[];
}): number {
  if (!product.isKit) return Number(product.acqPrice || 0);

  return (product.kitComponents ?? []).reduce(
    (total, component) =>
      total + Number(component.component?.acqPrice || 0) * component.quantity,
    0,
  );
}

/**
 * El envío por unidad de un producto, de su compra: el suyo si es un valor
 * real (`isKnownTransport`: ni vacío, ni 0, ni el 1.000 heredado). Un kit no
 * tiene envío propio: es la suma del de sus piezas, y si a una le falta, null.
 */
export function getProductUnitShipping(product: {
  transportationCost?: number | null;
  isKit?: boolean | null;
  kitComponents?: { quantity: number; component: { transportationCost?: number | null } | null }[];
}): number | null {
  if (!product.isKit) return isKnownTransport(product.transportationCost) ? Number(product.transportationCost) : null;
  const pieces = product.kitComponents ?? [];
  if (!pieces.length || !pieces.every((piece) => isKnownTransport(piece.component?.transportationCost))) return null;
  return pieces.reduce((total, piece) => total + Number(piece.component!.transportationCost) * piece.quantity, 0);
}

/**
 * Costo de producto de un pedido al pagarse, con los valores de ese momento:
 * compra (`getProductUnitCost`) + envío por unidad cuando se conoce
 * (`getProductUnitShipping`). `shippingMissing` dice si a alguna línea le faltó.
 */
export async function calculateProductCosts(
  orderItems: OrderItem[],
  prismadb: any,
): Promise<{ purchase: number; shipping: number; shippingMissing: boolean }> {
  const productIds = orderItems
    .map((item) => item.productId)
    .filter(Boolean) as string[];

  if (productIds.length === 0) return { purchase: 0, shipping: 0, shippingMissing: false };

  const products = await prismadb.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      acqPrice: true,
      transportationCost: true,
      isKit: true,
      kitComponents: {
        select: { quantity: true, component: { select: { acqPrice: true, transportationCost: true } } },
      },
    },
  });

  const byId = new Map<string, any>(products.map((p: any) => [p.id, p]));

  let purchase = 0;
  let shipping = 0;
  let shippingMissing = false;
  for (const item of orderItems) {
    if (!item.productId) continue;
    const product = byId.get(item.productId);
    if (!product) {
      shippingMissing = true;
      continue;
    }
    purchase += getProductUnitCost(product) * item.quantity;
    const unitShipping = getProductUnitShipping(product);
    if (unitShipping === null) shippingMissing = true;
    else shipping += unitShipping * item.quantity;
  }

  return { purchase, shipping, shippingMissing };
}

/** Compra + envío por unidad conocido de las líneas de un pedido. */
export async function calculateTotalProductCost(orderItems: OrderItem[], prismadb: any): Promise<number> {
  const { purchase, shipping } = await calculateProductCosts(orderItems, prismadb);
  return purchase + shipping;
}

/**
 * Comisión de pasarela de un cobro. La tabla vive en `lib/gateway-fees.ts`;
 * `null` = desconocida (datáfono Bold), nunca 0.
 */
export function calculateGatewayFee(
  total: number,
  paymentMethod: PaymentMethod | string | undefined,
  options: { channel?: GatewayChannel } = {},
): number | null {
  return gatewayFee(total, paymentMethod, options);
}

/**
 * Main service function to compute all financial metrics for an order.
 * This should be called EXACTLY ONCE when the order becomes PAID.
 */
export async function calculateOrderFinancials(
  order: OrderWithItems,
  paymentMethod: PaymentMethod | string | undefined,
  shippingCost: number,
  prismadb: any,
  /** `purchaseOnly`: costo solo de compra (el relleno de pedidos viejos, `lib/order-financials-backfill.ts`). */
  options: { purchaseOnly?: boolean } = {},
): Promise<FinancialMetrics> {
  // La pasarela cobra sobre lo que pasó por ella: el total menos lo que
  // cubrió una tarjeta de regalo.
  const chargedAmount = getAmountDue(order);
  const gatewayFee = calculateGatewayFee(chargedAmount, paymentMethod, { channel: gatewayChannelOf(order as never) });
  const knownFee = gatewayFee ?? 0;

  // La compra de una tarjeta de regalo no es una venta: no hay producto ni
  // utilidad; solo la comisión, que sí se paga. El ingreso se reconoce
  // cuando la tarjeta se usa (lib/revenue-orders.ts).
  if ((order as { type?: OrderType | null }).type === OrderType.GIFT_CARD) {
    return {
      totalProductCost: 0,
      productShippingCost: 0,
      productShippingMissing: false,
      gatewayFee,
      shippingCost: 0,
      netProfit: knownFee === 0 ? 0 : -knownFee,
      profitMarginPct: 0,
    };
  }

  const costs = await calculateProductCosts(order.orderItems, prismadb);
  if (options.purchaseOnly) Object.assign(costs, { shipping: 0, shippingMissing: true });
  const totalProductCost = costs.purchase + costs.shipping;

  // order.total is the gross amount paid by the customer (subtotal - discount + shipping)
  const netProfit = order.total - totalProductCost - knownFee - shippingCost;

  // Prevent division by zero
  const profitMarginPct = order.total > 0 ? (netProfit / order.total) * 100 : 0;

  return {
    totalProductCost,
    productShippingCost: costs.shipping,
    productShippingMissing: costs.shippingMissing,
    gatewayFee,
    shippingCost,
    netProfit,
    profitMarginPct,
  };
}

/**
 * Robust helper function to extract or compute net profit for an order.
 * Falls back to dynamic calculation if netProfit is null or missing in DB.
 */
export function getOrderNetProfit(order: any): number {
  const stored = order.netProfit !== null && order.netProfit !== undefined && !isNaN(Number(order.netProfit));
  // Un 0 guardado junto con su costo es un pedido sin ganancia, no un dato faltante.
  const costSaved = order.totalProductCost !== null && order.totalProductCost !== undefined;
  if (stored && (Number(order.netProfit) !== 0 || costSaved)) {
    return Number(order.netProfit);
  }

  const total = Number(order.total || order.subtotal || 0);
  if (total <= 0) return 0;

  const paymentMethod =
    order.payment?.method || order.paymentMethod || undefined;
  const shippingCost = Number(order.shipping?.cost || order.shippingCost || 0);

  // Una sola definicion de la comision: antes esta rama repetia la tarifa de
  // Wompi a mano, asi que cambiarla en un sitio dejaba el otro desfasado.
  const gatewayFee = calculateGatewayFee(total, paymentMethod, { channel: gatewayChannelOf(order) }) ?? 0;

  // Product cost calculation
  let totalProductCost = Number(order.totalProductCost || 0);
  if (!totalProductCost && Array.isArray(order.orderItems)) {
    for (const item of order.orderItems) {
      const acqPrice = item.product
        ? getProductUnitCost(item.product)
        : Number(item.acqPrice ?? 0);
      totalProductCost += acqPrice * Number(item.quantity || 1);
    }
  }

  const calculatedProfit = total - totalProductCost - gatewayFee - shippingCost;
  return isNaN(calculatedProfit) ? 0 : calculatedProfit;
}
