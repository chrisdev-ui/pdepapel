import { Order, OrderItem, PaymentMethod } from "@prisma/client";

interface OrderWithItems extends Order {
  orderItems: OrderItem[];
}

export interface FinancialMetrics {
  totalProductCost: number;
  gatewayFee: number;
  shippingCost: number;
  netProfit: number;
  profitMarginPct: number;
}

/**
 * Calculates the total product cost based on the acquisition price of each item at the time of purchase.
 * We must use a historical snapshot (if available) or the current `acqPrice` of the product.
 * To be 100% accurate historically, we should ideally fetch the Product `acqPrice` right before payment is confirmed.
 */
export async function calculateTotalProductCost(
  orderItems: OrderItem[],
  prismadb: any,
): Promise<number> {
  const productIds = orderItems
    .map((item) => item.productId)
    .filter(Boolean) as string[];

  if (productIds.length === 0) return 0;

  const products = await prismadb.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, acqPrice: true },
  });

  const priceMap = new Map<string, number>(
    products.map((p: any) => [p.id, p.acqPrice || 0]),
  );

  let totalCost = 0;
  for (const item of orderItems) {
    if (item.productId) {
      const cost = priceMap.get(item.productId) || 0;
      totalCost += cost * item.quantity;
    }
  }

  return totalCost;
}

/**
 * Calculates the payment gateway fee based on the payment method.
 * Rates based on standard Colombian gateway fees + 19% VAT on the fee itself.
 */
export function calculateGatewayFee(
  total: number,
  paymentMethod: PaymentMethod | string | undefined,
): number {
  if (!paymentMethod) return 0;

  // Ensure 'total' is a valid number to prevent NaN results
  const validTotal = Number(total) || 0;

  switch (paymentMethod) {
    // Wompi rates: ~2.65% + $700 COP + 19% VAT on the fee
    case PaymentMethod.Wompi: {
      const baseFee = validTotal * 0.0265 + 700;
      const vat = baseFee * 0.19;
      return baseFee + vat;
    }

    // Default to 0 for Bank transfers, Cash, COD, Bold
    case PaymentMethod.Bold:
    case PaymentMethod.BankTransfer:
    case PaymentMethod.COD:
    case PaymentMethod.CASH:
    default:
      return 0;
  }
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
): Promise<FinancialMetrics> {
  const totalProductCost = await calculateTotalProductCost(
    order.orderItems,
    prismadb,
  );
  const gatewayFee = calculateGatewayFee(order.total, paymentMethod);

  // order.total is the gross amount paid by the customer (subtotal - discount + shipping)
  const netProfit = order.total - totalProductCost - gatewayFee - shippingCost;

  // Prevent division by zero
  const profitMarginPct = order.total > 0 ? (netProfit / order.total) * 100 : 0;

  return {
    totalProductCost,
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
  if (
    order.netProfit !== null &&
    order.netProfit !== undefined &&
    !isNaN(Number(order.netProfit)) &&
    Number(order.netProfit) !== 0
  ) {
    return Number(order.netProfit);
  }

  const total = Number(order.total || order.subtotal || 0);
  if (total <= 0) return 0;

  const paymentMethod = order.payment?.method || order.paymentMethod || undefined;
  const shippingCost = Number(order.shipping?.cost || order.shippingCost || 0);

  // Gateway fee calculation
  let gatewayFee = 0;
  if (paymentMethod === PaymentMethod.Wompi || paymentMethod === "Wompi") {
    const baseFee = total * 0.0265 + 700;
    gatewayFee = baseFee + baseFee * 0.19;
  }

  // Product cost calculation
  let totalProductCost = Number(order.totalProductCost || 0);
  if (!totalProductCost && Array.isArray(order.orderItems)) {
    for (const item of order.orderItems) {
      const acqPrice = Number(
        item.product?.acqPrice ?? item.acqPrice ?? 0,
      );
      totalProductCost += acqPrice * Number(item.quantity || 1);
    }
  }

  const calculatedProfit = total - totalProductCost - gatewayFee - shippingCost;
  return isNaN(calculatedProfit) ? 0 : calculatedProfit;
}

