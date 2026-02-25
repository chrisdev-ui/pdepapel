import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";
import { subDays } from "date-fns";

export type RiskState = "CRITICAL" | "WARNING" | "SAFE" | "NO_DATA";

export interface InventoryRiskItem {
  productId: string;
  name: string;
  currentStock: number;
  thirtyDaySales: number;
  averageDailySales: number;
  daysUntilStockout: number;
  riskState: RiskState;
  supplierId: string | null;
}

/**
 * Calculates stockout risk based on 30-day sales velocity.
 * - CRITICAL: Stockout in < 7 days
 * - WARNING: Stockout in < 14 days
 * - SAFE: Stockout in > 14 days
 */
export async function getInventoryRisk(
  storeId: string,
): Promise<InventoryRiskItem[]> {
  const thirtyDaysAgo = subDays(new Date(), 30);

  // Get active products with stock <= 20 (rough filter for risk to limit processing)
  // or products that have high velocity. Let's get all active products for accuracy.
  const products = await prismadb.product.findMany({
    where: {
      storeId,
      isArchived: false,
    },
    select: {
      id: true,
      name: true,
      stock: true,
      supplierId: true,
    },
  });

  // Calculate sales velocity for all products in a single pass using aggregations if possible,
  // or by fetching recent order items.
  const recentSales = await prismadb.orderItem.groupBy({
    by: ["productId"],
    where: {
      order: {
        storeId,
        status: { in: [OrderStatus.PAID, OrderStatus.SENT] },
        createdAt: { gte: thirtyDaysAgo },
      },
      productId: { in: products.map((p: any) => p.id) },
    },
    _sum: {
      quantity: true,
    },
  });

  const salesMap = new Map(
    recentSales.map((sale: any) => [sale.productId, sale._sum.quantity || 0]),
  );

  const riskAssessment: InventoryRiskItem[] = products.map((product: any) => {
    const thirtyDaySales = salesMap.get(product.id) || 0;
    const averageDailySales = thirtyDaySales / 30;

    let daysUntilStockout = 999;
    let riskState: RiskState = "NO_DATA";

    if (averageDailySales > 0) {
      daysUntilStockout = Math.floor(product.stock / averageDailySales);

      if (daysUntilStockout <= 7) {
        riskState = "CRITICAL";
      } else if (daysUntilStockout <= 14) {
        riskState = "WARNING";
      } else {
        riskState = "SAFE";
      }
    } else if (product.stock === 0) {
      daysUntilStockout = 0;
      riskState = "CRITICAL";
    }

    return {
      productId: product.id,
      name: product.name,
      currentStock: product.stock,
      thirtyDaySales,
      averageDailySales,
      daysUntilStockout,
      riskState,
      supplierId: product.supplierId,
    };
  });

  // Filter to only return items that actually have a risk or high velocity
  return riskAssessment
    .filter(
      (item) =>
        item.riskState === "CRITICAL" ||
        item.riskState === "WARNING" ||
        item.currentStock === 0,
    )
    .sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
}
