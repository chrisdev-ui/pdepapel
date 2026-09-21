import prismadb from "@/lib/prismadb";
import { salesWatermark } from "@/lib/sales-watermark";
import { shortMemo } from "@/lib/short-memo";
import { requireStoreRead } from "@/lib/store-access";
import { OrderStatus } from "@prisma/client";
import { endOfYear, getMonth, startOfYear } from "date-fns";
import {
  createSettledMarketplaceSalesWhere,
  getMarketplaceNetRevenue,
  getMarketplaceSaleDate,
} from "@/lib/mercadolibre/reporting";

interface GraphData {
  name: string;
  total: number;
  subtotal: number;
  discounts: number;
  couponDiscounts: number;
  marketplaceRevenue: number;
}

/**
 * El gráfico de ventas del año de la pantalla de inicio.
 *
 * Abierto a una cuenta de solo lectura a propósito: son ventas, que es lo que
 * la agencia necesita ver. La guardia va aquí, en el punto de la consulta, y
 * no solo en la pantalla.
 *
 * Se reutiliza mientras las ventas no cambien: recorre el año entero y la
 * pantalla se abre en cada inicio de sesión.
 */
export const getGraphRevenue = async (
  storeId: string,
  year: number,
): Promise<GraphData[]> => {
  await requireStoreRead(storeId);
  return shortMemo({
    key: `grafico-ventas:${storeId}:${year}`,
    watermark: () => salesWatermark(storeId),
    build: () => buildGraphRevenue(storeId, year),
  });
};

const buildGraphRevenue = async (
  storeId: string,
  year: number,
): Promise<GraphData[]> => {
  const yearDate = new Date(year, 0, 1);
  const startDate = startOfYear(yearDate);
  const endDate = endOfYear(yearDate);

  const [paidOrders, marketplaceOrders] = await Promise.all([
    prismadb.order.findMany({
      where: {
        storeId,
        status: {
          in: [OrderStatus.PAID, OrderStatus.SENT],
        },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        createdAt: true,
        total: true,
        subtotal: true,
        discount: true,
        couponDiscount: true,
      },
    }),
    prismadb.marketplaceOrder.findMany({
      where: createSettledMarketplaceSalesWhere(storeId, {
        start: startDate,
        end: endDate,
      }),
      select: { netAmount: true, paidAt: true, createdAt: true },
    }),
  ]);

  const monthlyRevenue: { [key: number]: GraphData } = {};
  const months = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];

  months.forEach((name, index) => {
    monthlyRevenue[index] = {
      name,
      total: 0,
      subtotal: 0,
      discounts: 0,
      couponDiscounts: 0,
      marketplaceRevenue: 0,
    };
  });

  for (const order of paidOrders) {
    const month = getMonth(order.createdAt);
    monthlyRevenue[month].total += order.total;
    monthlyRevenue[month].subtotal += order.subtotal;
    monthlyRevenue[month].discounts += order.discount;
    monthlyRevenue[month].couponDiscounts += order.couponDiscount;
  }

  for (const order of marketplaceOrders) {
    const month = getMonth(getMarketplaceSaleDate(order));
    const netRevenue = getMarketplaceNetRevenue(order);
    monthlyRevenue[month].total += netRevenue;
    monthlyRevenue[month].marketplaceRevenue += netRevenue;
  }

  return Object.values(monthlyRevenue);
};
