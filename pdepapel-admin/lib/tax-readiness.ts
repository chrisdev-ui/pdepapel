import prismadb from "@/lib/prismadb";
import { MarketplaceOrderStatus, OrderStatus, RestockOrderStatus } from "@prisma/client";

/**
 * Revisión previa del reporte tributario: lo que haría que el Excel llegue
 * incompleto o inconsistente al contador. Conteos puros más un cargador.
 */

export interface TaxReadinessCounts {
  paidWithoutDate: number;
  marketplacePendingSettlement: number;
  restockCompleted: number;
  purchasesRegistered: number;
}

export interface TaxReadinessItem {
  id: "paid-without-date" | "marketplace-pending" | "purchases-gap";
  title: string;
  detail: string;
  href: string;
  tone: "cream" | "pink" | "sky";
}

export interface TaxReadiness {
  year: number;
  items: TaxReadinessItem[];
  ready: boolean;
}

export function buildTaxReadiness(counts: TaxReadinessCounts, storeId: string, year: number): TaxReadiness {
  const items: TaxReadinessItem[] = [];
  if (counts.paidWithoutDate > 0) {
    items.push({
      id: "paid-without-date",
      title: `${counts.paidWithoutDate} ${counts.paidWithoutDate === 1 ? "pedido pagado sin fecha de pago" : "pedidos pagados sin fecha de pago"}`,
      detail: "Fueron marcados a mano antes de que existiera la fecha de pago; el reporte por confirmación de pago los ubica por su fecha de creación.",
      href: `/${storeId}/pedidos?vista=todos`,
      tone: "cream",
    });
  }
  if (counts.marketplacePendingSettlement > 0) {
    items.push({
      id: "marketplace-pending",
      title: `${counts.marketplacePendingSettlement} ${counts.marketplacePendingSettlement === 1 ? "venta de Mercado Libre sin liquidación" : "ventas de Mercado Libre sin liquidación"}`,
      detail: "Solo entran al reporte con el neto confirmado. Revísalas en Mercado Libre antes de exportar.",
      href: `/${storeId}/mercadolibre`,
      tone: "pink",
    });
  }
  if (counts.restockCompleted > counts.purchasesRegistered) {
    const gap = counts.restockCompleted - counts.purchasesRegistered;
    items.push({
      id: "purchases-gap",
      title: `${gap} ${gap === 1 ? "orden de aprovisionamiento completada sin factura registrada" : "órdenes de aprovisionamiento completadas sin factura registrada"}`,
      detail: `Este año hay ${counts.restockCompleted} órdenes completadas y ${counts.purchasesRegistered} facturas de compra. Una orden no es soporte fiscal: registra la factura del proveedor.`,
      href: `/${storeId}/aprovisionamiento`,
      tone: "sky",
    });
  }
  return { year, items, ready: items.length === 0 };
}

export async function getTaxReadiness(storeId: string, year = new Date().getFullYear()): Promise<TaxReadiness> {
  const start = new Date(Date.UTC(year, 0, 1, 5));
  const end = new Date(Date.UTC(year + 1, 0, 1, 5) - 1);
  const [paidWithoutDate, marketplacePendingSettlement, restockCompleted, purchasesRegistered] = await Promise.all([
    prismadb.order.count({ where: { storeId, status: { in: [OrderStatus.PAID, OrderStatus.SENT] }, paidAt: null, createdAt: { gte: start, lte: end } } }),
    prismadb.marketplaceOrder.count({ where: { connection: { storeId }, status: MarketplaceOrderStatus.PAID, netAmount: null } }).catch(() => 0),
    prismadb.restockOrder.count({ where: { storeId, status: RestockOrderStatus.COMPLETED, updatedAt: { gte: start, lte: end } } }).catch(() => 0),
    prismadb.taxPurchase.count({ where: { storeId, issuedAt: { gte: start, lte: end } } }).catch(() => 0),
  ]);
  return buildTaxReadiness({ paidWithoutDate, marketplacePendingSettlement, restockCompleted, purchasesRegistered }, storeId, year);
}
