import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";
import { subDays } from "date-fns";

export interface ProductProfitRanking {
  productId: string;
  name: string;
  category: string;
  totalQuantitySold: number;
  totalRevenue: number;
  totalProfit: number;
  profitMarginPct: number;
  currentStock: number;
}

export interface DeadInventoryProduct {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  price: number;
  acqPrice: number | null;
  daysSinceLastSale: number | null;
  capitalTiedUp: number;
}

/**
 * Ranks products by their total net profit contribution over a given period.
 *
 * NOTE: Since OrderItem does not store individual profit (profit is calculated at the Order level),
 * we distribute the order's net profit proportionally based on the item's revenue share.
 */
export async function getProductProfitRanking(
  storeId: string,
  year?: number,
  month?: number,
  limit: number = 50,
): Promise<ProductProfitRanking[]> {
  let startDate: Date;
  let endDate: Date;

  if (year && month) {
    startDate = new Date(year, month - 1, 1);
    endDate = new Date(year, month, 0, 23, 59, 59, 999);
  } else {
    startDate = subDays(new Date(), 30);
    endDate = new Date();
  }

  const orders = await prismadb.order.findMany({
    where: {
      storeId,
      status: { in: [OrderStatus.PAID, OrderStatus.SENT] },
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      orderItems: {
        include: { product: { include: { category: true } } },
      },
    },
  });

  const productStats = new Map<string, ProductProfitRanking>();

  for (const order of orders) {
    // We already filter by createdAt in Prisma, but to be robust with paidAt if used:
    const paidAtDate = (order as any).paidAt;
    if (paidAtDate) {
      const pDate = new Date(paidAtDate);
      if (pDate < startDate || pDate > endDate) continue;
    }

    const netProfit = (order as any).netProfit;
    if (!netProfit || !order.total) continue;

    // Distribute order profit proportionally to items based on their revenue share
    for (const item of (order as any).orderItems) {
      if (!item.productId || !item.product) continue;

      const itemRevenue = item.price * item.quantity;
      const revenueShare = itemRevenue / order.total;
      const itemProfitShare = netProfit * revenueShare;

      const existing = productStats.get(item.productId) || {
        productId: item.productId,
        name: item.product.name,
        category: item.product.category.name,
        totalQuantitySold: 0,
        totalRevenue: 0,
        totalProfit: 0,
        profitMarginPct: 0,
        currentStock: item.product.stock,
      };

      existing.totalQuantitySold += item.quantity;
      existing.totalRevenue += itemRevenue;
      existing.totalProfit += itemProfitShare;
      existing.profitMarginPct =
        (existing.totalProfit / existing.totalRevenue) * 100;

      productStats.set(item.productId, existing);
    }
  }

  // Convert to array and sort by profit
  return Array.from(productStats.values())
    .sort((a, b) => b.totalProfit - a.totalProfit)
    .slice(0, limit);
}

/**
 * Identifies products with stock that haven't sold in the last X days.
 */
export async function getDeadInventory(
  storeId: string,
  daysInactive: number = 90,
): Promise<DeadInventoryProduct[]> {
  const cutoffDate = subDays(new Date(), daysInactive);

  // Find all products that have stock > 0
  // and were created BEFORE the cutoff date (a product created yesterday hasn't had time to be sold)
  const products = await prismadb.product.findMany({
    where: {
      storeId,
      stock: { gt: 0 },
      isArchived: false,
      createdAt: { lt: cutoffDate },
    },
    include: {
      orderItems: {
        where: {
          order: { status: { in: [OrderStatus.PAID, OrderStatus.SENT] } },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
      inventoryMovements: {
        where: { type: "ORDER_PLACED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const deadStock: DeadInventoryProduct[] = [];

  for (const product of products) {
    // Determine the last sale date (either from orderItems or inventory movements)
    const lastOrderDate = product.orderItems[0]?.createdAt;
    const lastMovementDate = product.inventoryMovements[0]?.createdAt;

    // Pick the most recent one
    let lastSaleDate = lastOrderDate;
    if (
      lastMovementDate &&
      (!lastSaleDate || lastMovementDate > lastSaleDate)
    ) {
      lastSaleDate = lastMovementDate;
    }

    // If it has never sold, or hasn't sold since the cutoff date
    if (!lastSaleDate || lastSaleDate < cutoffDate) {
      const daysSinceLastSale = lastSaleDate
        ? Math.floor(
            (new Date().getTime() - lastSaleDate.getTime()) /
              (1000 * 3600 * 24),
          )
        : null;

      deadStock.push({
        id: product.id,
        name: product.name,
        sku: product.sku,
        stock: product.stock,
        price: product.price,
        acqPrice: product.acqPrice,
        daysSinceLastSale,
        // Calculate capital tied up based on acquisition price if available, otherwise 0
        capitalTiedUp: (product.acqPrice || 0) * product.stock,
      });
    }
  }

  // Sort by capital tied up (descending) so highest risk is first
  return deadStock.sort((a, b) => b.capitalTiedUp - a.capitalTiedUp);
}
