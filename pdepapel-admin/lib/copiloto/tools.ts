import { MarketplaceConnectionStatus, MarketplaceProvider, OrderStatus, OrderType, Prisma } from "@prisma/client";
import { tool } from "ai";
import { endOfMonth, format, startOfDay, startOfMonth, subDays, subMonths } from "date-fns";
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";
import { z } from "zod";

import { TRESHOLD_LOW_STOCK } from "@/constants";
import { withCopilotQuery, type CopilotDb } from "@/lib/copiloto/db";
import { channelForOrderType } from "@/lib/dashboard-today";
import { getOrderNetProfit } from "@/lib/financial";
import {
  createSettledMarketplaceSalesWhere,
  getMarketplaceNetRevenue,
  getMarketplaceOrderNetProfit,
} from "@/lib/mercadolibre/reporting";
import { revenueOrderWhere } from "@/lib/revenue-orders";
import { productNameSearchConditions } from "@/lib/search-terms";
import { requireStoreOwner } from "@/lib/store-access";

/**
 * Las herramientas del copiloto: solo lectura, con límites, sobre la conexión
 * `copilot_ro`. Cada una pide sus columnas una por una (`select`): ese usuario
 * no puede leer nombres, teléfonos, correos ni direcciones de clientas, y un
 * `include` o un `findMany` sin `select` fallaría. Por eso no reusan los
 * cargadores del panel; sus cifras pueden diferir un poco de las pantallas
 * (ver docs/design/asistente-experto-paula.md §4).
 *
 * El `storeId` lo pone la ruta, nunca el modelo.
 */
const TZ = "America/Bogota";

export interface ToolEnvelope<T> {
  fuente: string;
  rango: string | null;
  actualizadoEl: string;
  datos: T;
  truncado: boolean;
}

const envelope = <T>(fuente: string, rango: string | null, datos: T, truncado = false): ToolEnvelope<T> => ({
  fuente,
  rango,
  actualizadoEl: new Date().toISOString(),
  datos,
  truncado,
});

const dayBounds = (isoDay: string) => {
  const start = zonedTimeToUtc(`${isoDay}T00:00:00`, TZ);
  const end = zonedTimeToUtc(`${isoDay}T23:59:59.999`, TZ);
  return { start, end };
};
const todayIso = (now = new Date()) => format(utcToZonedTime(now, TZ), "yyyy-MM-dd");
const monthBounds = (year: number, month: number) => {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const start = zonedTimeToUtc(`${first}T00:00:00`, TZ);
  const lastDay = format(endOfMonth(new Date(year, month - 1, 1)), "yyyy-MM-dd");
  const end = zonedTimeToUtc(`${lastDay}T23:59:59.999`, TZ);
  return { start, end };
};
const round = (value: number) => Math.round(value);

/** Pagado en el rango, o creado en el rango si no tiene fecha de pago (como el panel). */
const paidInRange = (start: Date, end: Date): Prisma.OrderWhereInput => ({
  OR: [{ paidAt: { gte: start, lte: end } }, { paidAt: null, createdAt: { gte: start, lte: end } }],
});

const ORDER_MONEY_SELECT = {
  type: true,
  total: true,
  subtotal: true,
  netProfit: true,
  totalProductCost: true,
  payment: { select: { method: true } },
  shipping: { select: { cost: true } },
  orderItems: { select: { quantity: true, product: { select: { acqPrice: true } } } },
} satisfies Prisma.OrderSelect;

const MARKETPLACE_MONEY_SELECT = {
  netAmount: true,
  paidAt: true,
  createdAt: true,
  items: { select: { quantity: true, unitPrice: true, acqPrice: true, product: { select: { acqPrice: true } } } },
} satisfies Prisma.MarketplaceOrderSelect;

async function monthSummary(db: CopilotDb, storeId: string, year: number, month: number) {
  const { start, end } = monthBounds(year, month);
  const [orders, marketplace] = await Promise.all([
    db.order.findMany({ where: { storeId, ...revenueOrderWhere(), ...paidInRange(start, end) }, select: ORDER_MONEY_SELECT }),
    db.marketplaceOrder.findMany({ where: createSettledMarketplaceSalesWhere(storeId, { start, end }), select: MARKETPLACE_MONEY_SELECT }),
  ]);
  const byChannel: Record<string, { ingresos: number; utilidad: number; pedidos: number }> = {};
  for (const order of orders) {
    const channel = channelForOrderType(order.type);
    byChannel[channel] ??= { ingresos: 0, utilidad: 0, pedidos: 0 };
    byChannel[channel].ingresos += order.total || order.subtotal || 0;
    byChannel[channel].utilidad += getOrderNetProfit(order);
    byChannel[channel].pedidos += 1;
  }
  if (marketplace.length > 0) {
    byChannel.mercadolibre = { ingresos: 0, utilidad: 0, pedidos: 0 };
    for (const order of marketplace) {
      byChannel.mercadolibre.ingresos += getMarketplaceNetRevenue(order);
      byChannel.mercadolibre.utilidad += getMarketplaceOrderNetProfit(order);
      byChannel.mercadolibre.pedidos += 1;
    }
  }
  const ingresos = Object.values(byChannel).reduce((sum, row) => sum + row.ingresos, 0);
  const utilidad = Object.values(byChannel).reduce((sum, row) => sum + row.utilidad, 0);
  return {
    ingresos: round(ingresos),
    utilidadNeta: round(utilidad),
    margenPct: ingresos > 0 ? Math.round((utilidad / ingresos) * 1000) / 10 : 0,
    pedidos: Object.values(byChannel).reduce((sum, row) => sum + row.pedidos, 0),
    porCanal: Object.fromEntries(
      Object.entries(byChannel).map(([channel, row]) => [
        channel,
        { ingresos: round(row.ingresos), utilidad: round(row.utilidad), pedidos: row.pedidos },
      ]),
    ),
  };
}

/** Ventas de los últimos 30 días por producto (tienda y Mercado Libre), para cobertura y riesgo. */
async function sales30(db: CopilotDb, storeId: string, productIds: string[]) {
  const since = subDays(new Date(), 30);
  const [shop, marketplace] = await Promise.all([
    db.orderItem.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, order: { storeId, ...revenueOrderWhere(), ...paidInRange(since, new Date()) } },
      _sum: { quantity: true },
    }),
    db.marketplaceOrderItem.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, marketplaceOrder: createSettledMarketplaceSalesWhere(storeId, { start: since, end: new Date() }) },
      _sum: { quantity: true },
    }),
  ]);
  const sold = new Map<string, number>();
  for (const row of [...shop, ...marketplace]) {
    if (row.productId) sold.set(row.productId, (sold.get(row.productId) ?? 0) + (row._sum.quantity ?? 0));
  }
  return sold;
}

async function coverRows(db: CopilotDb, storeId: string, supplierId?: string | null) {
  const products = await db.product.findMany({
    where: { storeId, isArchived: false, ...(supplierId ? { supplierId } : {}) },
    select: { id: true, name: true, sku: true, stock: true, price: true, supplier: { select: { name: true } } },
    take: 3000,
  });
  const sold = await sales30(db, storeId, products.map((product) => product.id));
  return products.map((product) => {
    const units = sold.get(product.id) ?? 0;
    const perDay = units / 30;
    return {
      productId: product.id,
      nombre: product.name,
      sku: product.sku,
      stock: product.stock,
      vendidas30Dias: units,
      diasDeCobertura: perDay > 0 ? Math.round((product.stock / perDay) * 10) / 10 : null,
      proveedor: product.supplier?.name ?? null,
    };
  });
}

const monthInput = z.object({
  anio: z.number().int().min(2024).max(2100).describe("Año, por ejemplo 2026"),
  mes: z.number().int().min(1).max(12).describe("Mes de 1 a 12"),
});

function assertRecentMonth(year: number, month: number) {
  const requested = new Date(year, month - 1, 1);
  const now = new Date();
  if (requested > now) throw new Error("Ese mes todavía no ha pasado.");
  if (requested < startOfMonth(subMonths(now, 24))) throw new Error("Solo puedo consultar los últimos 24 meses.");
}

export function buildCopilotTools(storeId: string) {
  const run = async <T>(work: (db: CopilotDb) => Promise<T>) => {
    await requireStoreOwner(storeId);
    return withCopilotQuery(work);
  };

  return {
    resumenDeHoy: tool({
      description: "Ventas, pedidos y unidades de hoy (hora de Colombia) por canal, pedidos pendientes y productos con stock bajo.",
      inputSchema: z.object({}),
      execute: async () =>
        run(async (db) => {
          const day = todayIso();
          const { start, end } = dayBounds(day);
          const [orders, pending, store, marketplace] = await Promise.all([
            db.order.findMany({
              where: { storeId, ...revenueOrderWhere(), ...paidInRange(start, end) },
              select: { type: true, total: true, subtotal: true, orderItems: { select: { quantity: true } } },
            }),
            db.order.count({ where: { storeId, status: OrderStatus.PENDING } }),
            db.store.findUnique({ where: { id: storeId }, select: { lowStockThreshold: true } }),
            db.marketplaceOrder.findMany({ where: createSettledMarketplaceSalesWhere(storeId, { start, end }), select: { netAmount: true } }),
          ]);
          const threshold = store?.lowStockThreshold ?? TRESHOLD_LOW_STOCK;
          const lowStock = await db.product.count({ where: { storeId, isArchived: false, stock: { lte: threshold } } });
          const porCanal: Record<string, { ventas: number; pedidos: number; unidades: number }> = {};
          for (const order of orders) {
            const channel = channelForOrderType(order.type);
            porCanal[channel] ??= { ventas: 0, pedidos: 0, unidades: 0 };
            porCanal[channel].ventas += order.total || order.subtotal || 0;
            porCanal[channel].pedidos += 1;
            porCanal[channel].unidades += order.orderItems.reduce((sum, item) => sum + item.quantity, 0);
          }
          if (marketplace.length > 0) {
            porCanal.mercadolibre = {
              ventas: round(marketplace.reduce((sum, order) => sum + getMarketplaceNetRevenue(order), 0)),
              pedidos: marketplace.length,
              unidades: 0,
            };
          }
          return envelope("resumenDeHoy", day, {
            porCanal,
            pedidosPendientes: pending,
            productosConStockBajo: lowStock,
            umbralStockBajo: threshold,
          });
        }),
    }),

    resumenFinancieroMes: tool({
      description: "Ingresos, utilidad neta, margen y pedidos de un mes, por canal (tienda, presencial, feria, Mercado Libre).",
      inputSchema: monthInput,
      execute: async ({ anio, mes }) => {
        assertRecentMonth(anio, mes);
        return run(async (db) => envelope("resumenFinancieroMes", `${anio}-${String(mes).padStart(2, "0")}`, await monthSummary(db, storeId, anio, mes)));
      },
    }),

    compararMeses: tool({
      description: "Compara un mes con el anterior: ingresos, utilidad, margen y pedidos, con la variación en porcentaje.",
      inputSchema: monthInput,
      execute: async ({ anio, mes }) => {
        assertRecentMonth(anio, mes);
        const previous = subMonths(new Date(anio, mes - 1, 1), 1);
        return run(async (db) => {
          const [actual, anterior] = await Promise.all([
            monthSummary(db, storeId, anio, mes),
            monthSummary(db, storeId, previous.getFullYear(), previous.getMonth() + 1),
          ]);
          const change = (now: number, before: number) => (before === 0 ? null : Math.round(((now - before) / Math.abs(before)) * 1000) / 10);
          return envelope("compararMeses", `${format(previous, "yyyy-MM")} → ${anio}-${String(mes).padStart(2, "0")}`, {
            actual,
            anterior,
            variacionPct: {
              ingresos: change(actual.ingresos, anterior.ingresos),
              utilidadNeta: change(actual.utilidadNeta, anterior.utilidadNeta),
              pedidos: change(actual.pedidos, anterior.pedidos),
            },
          });
        });
      },
    }),

    ventasDelDiaPuntoDeVenta: tool({
      description: "Ventas presenciales (punto de venta) de un día, por medio de pago.",
      inputSchema: z.object({ fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Día en formato AAAA-MM-DD, hora de Colombia") }),
      execute: async ({ fecha }) => {
        const { start, end } = dayBounds(fecha);
        if (start > new Date() || start < subDays(startOfDay(new Date()), 90)) throw new Error("Solo puedo consultar los últimos 90 días.");
        return run(async (db) => {
          const orders = await db.order.findMany({
            where: { storeId, type: OrderType.POINT_OF_SALE, ...revenueOrderWhere(), ...paidInRange(start, end) },
            select: { total: true, payment: { select: { method: true } } },
          });
          const porMedio: Record<string, { ventas: number; pedidos: number }> = {};
          for (const order of orders) {
            const method = order.payment?.method ?? "sin registrar";
            porMedio[method] ??= { ventas: 0, pedidos: 0 };
            porMedio[method].ventas += order.total;
            porMedio[method].pedidos += 1;
          }
          return envelope("ventasDelDiaPuntoDeVenta", fecha, {
            total: round(orders.reduce((sum, order) => sum + order.total, 0)),
            pedidos: orders.length,
            porMedio,
          });
        });
      },
    }),

    buscarProductos: tool({
      description: "Busca productos del catálogo por nombre. Devuelve precio, stock y categoría.",
      inputSchema: z.object({
        texto: z.string().trim().min(1).max(60),
        soloConStock: z.boolean().optional(),
        limite: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ texto, soloConStock, limite }) =>
        run(async (db) => {
          const take = limite ?? 10;
          const rows = await db.product.findMany({
            where: {
              storeId,
              isArchived: false,
              AND: productNameSearchConditions(texto),
              ...(soloConStock ? { stock: { gt: 0 } } : {}),
            },
            select: { id: true, name: true, sku: true, price: true, stock: true, category: { select: { name: true } } },
            orderBy: { stock: "desc" },
            take: take + 1,
          });
          return envelope(
            "buscarProductos",
            null,
            rows.slice(0, take).map((row) => ({
              productId: row.id,
              nombre: row.name,
              sku: row.sku,
              precio: row.price,
              stock: row.stock,
              categoria: row.category?.name ?? null,
            })),
            rows.length > take,
          );
        }),
    }),

    detalleProducto: tool({
      description: "Detalle de un producto por su id: precio, costo, margen, stock y unidades vendidas.",
      inputSchema: z.object({ productId: z.string().trim().min(1).max(64) }),
      execute: async ({ productId }) =>
        run(async (db) => {
          const product = await db.product.findFirst({
            where: { id: productId, storeId },
            select: {
              id: true,
              name: true,
              sku: true,
              price: true,
              acqPrice: true,
              transportationCost: true,
              stock: true,
              soldCount: true,
              isArchived: true,
              category: { select: { name: true } },
            },
          });
          if (!product) return envelope("detalleProducto", null, { encontrado: false });
          const cost = product.acqPrice !== null ? product.acqPrice + (product.transportationCost ?? 0) : null;
          return envelope("detalleProducto", null, {
            encontrado: true,
            productId: product.id,
            nombre: product.name,
            sku: product.sku,
            precio: product.price,
            costo: cost,
            margenPct: cost !== null && product.price > 0 ? Math.round(((product.price - cost) / product.price) * 1000) / 10 : null,
            precioBajoCosto: cost !== null ? product.price < cost : null,
            stock: product.stock,
            vendidasHistorico: product.soldCount,
            archivado: product.isArchived,
            categoria: product.category?.name ?? null,
          });
        }),
    }),

    kardexProducto: tool({
      description: "Movimientos de inventario de un producto (entradas, salidas, ajustes) de los últimos días.",
      inputSchema: z.object({ productId: z.string().trim().min(1).max(64), dias: z.number().int().min(1).max(90).optional() }),
      execute: async ({ productId, dias }) =>
        run(async (db) => {
          const since = subDays(new Date(), dias ?? 30);
          const rows = await db.inventoryMovement.findMany({
            where: { storeId, productId, createdAt: { gte: since } },
            select: { type: true, quantity: true, previousStock: true, newStock: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 501,
          });
          return envelope(
            "kardexProducto",
            `${format(since, "yyyy-MM-dd")} → ${todayIso()}`,
            rows.slice(0, 500).map((row) => ({
              tipo: row.type,
              cantidad: row.quantity,
              stockAntes: row.previousStock,
              stockDespues: row.newStock,
              fecha: row.createdAt.toISOString(),
            })),
            rows.length > 500,
          );
        }),
    }),

    porReponer: tool({
      description: "Productos que conviene reponer: los que se venden y tienen menos días de cobertura, con una cantidad sugerida para 14 días.",
      inputSchema: z.object({ limite: z.number().int().min(1).max(20).optional(), proveedorId: z.string().max(64).optional() }),
      execute: async ({ limite, proveedorId }) =>
        run(async (db) => {
          const rows = (await coverRows(db, storeId, proveedorId))
            .filter((row) => row.vendidas30Dias > 0)
            .sort((a, b) => (a.diasDeCobertura ?? 0) - (b.diasDeCobertura ?? 0));
          const take = limite ?? 10;
          return envelope(
            "porReponer",
            "ventas de los últimos 30 días",
            rows.slice(0, take).map((row) => ({
              ...row,
              cantidadSugerida14Dias: Math.max(0, Math.ceil((row.vendidas30Dias / 30) * 14 - row.stock)),
            })),
            rows.length > take,
          );
        }),
    }),

    riesgoInventario: tool({
      description: "Agotados que se venden y productos que se agotan en menos de 7 días al ritmo de los últimos 30 días.",
      inputSchema: z.object({ limite: z.number().int().min(1).max(20).optional() }),
      execute: async ({ limite }) =>
        run(async (db) => {
          const rows = await coverRows(db, storeId);
          const take = limite ?? 10;
          const agotados = rows.filter((row) => row.stock <= 0 && row.vendidas30Dias > 0).sort((a, b) => b.vendidas30Dias - a.vendidas30Dias);
          const criticos = rows
            .filter((row) => row.stock > 0 && row.diasDeCobertura !== null && row.diasDeCobertura < 7)
            .sort((a, b) => (a.diasDeCobertura ?? 0) - (b.diasDeCobertura ?? 0));
          return envelope(
            "riesgoInventario",
            "ventas de los últimos 30 días",
            { agotadosConDemanda: agotados.slice(0, take), seAgotanEnMenosDe7Dias: criticos.slice(0, take) },
            agotados.length > take || criticos.length > take,
          );
        }),
    }),

    reporteTributario: tool({
      description: "Totales de ventas por canal y de compras con factura de un mes o de un bimestre, para preparar la declaración. No reemplaza al contador.",
      inputSchema: monthInput.extend({ bimestral: z.boolean().optional().describe("true para el bimestre que empieza en ese mes") }),
      execute: async ({ anio, mes, bimestral }) => {
        assertRecentMonth(anio, mes);
        const months = bimestral ? [mes, mes === 12 ? 1 : mes + 1] : [mes];
        return run(async (db) => {
          const ventas = await Promise.all(months.map((m, i) => monthSummary(db, storeId, m < mes ? anio + 1 : anio, months[i])));
          const { start } = monthBounds(anio, mes);
          const lastMonth = months[months.length - 1];
          const { end } = monthBounds(lastMonth < mes ? anio + 1 : anio, lastMonth);
          const compras = await db.taxPurchase.aggregate({
            where: { storeId, issuedAt: { gte: start, lte: end } },
            _sum: { totalAmount: true },
            _count: { _all: true },
          });
          return envelope("reporteTributario", `${format(start, "yyyy-MM-dd")} → ${format(end, "yyyy-MM-dd")}`, {
            ventas: ventas.reduce((sum, row) => sum + row.ingresos, 0),
            pedidos: ventas.reduce((sum, row) => sum + row.pedidos, 0),
            comprasConFactura: { total: round(Number(compras._sum.totalAmount ?? 0)), facturas: compras._count._all },
            aviso: "Totales para orientarse; la declaración la prepara el contador con el reporte del panel.",
          });
        });
      },
    }),

    saludMercadoLibre: tool({
      description: "Estado de la conexión con Mercado Libre, publicaciones por estado y alertas abiertas. Sin cifras de dinero.",
      inputSchema: z.object({}),
      execute: async () =>
        run(async (db) => {
          const connection = await db.marketplaceConnection.findFirst({
            where: { storeId, provider: MarketplaceProvider.MERCADOLIBRE },
            select: { id: true, status: true, lastSyncedAt: true },
          });
          if (!connection) return envelope("saludMercadoLibre", null, { conectado: false });
          const [listings, alerts] = await Promise.all([
            db.marketplaceListing.groupBy({ by: ["status"], where: { connectionId: connection.id }, _count: { _all: true } }),
            db.marketplaceAlertState.groupBy({
              by: ["kind"],
              where: { connectionId: connection.id, resolvedAt: null, dismissedAt: null },
              _count: { _all: true },
            }),
          ]);
          return envelope("saludMercadoLibre", null, {
            conectado: connection.status === MarketplaceConnectionStatus.CONNECTED,
            estado: connection.status,
            ultimaSincronizacion: connection.lastSyncedAt?.toISOString() ?? null,
            publicacionesPorEstado: Object.fromEntries(listings.map((row) => [row.status, row._count._all])),
            alertasAbiertas: Object.fromEntries(alerts.map((row) => [row.kind, row._count._all])),
          });
        }),
    }),
  };
}

export type CopilotTools = ReturnType<typeof buildCopilotTools>;
export const COPILOT_TOOL_NAMES = [
  "resumenDeHoy",
  "resumenFinancieroMes",
  "compararMeses",
  "ventasDelDiaPuntoDeVenta",
  "buscarProductos",
  "detalleProducto",
  "kardexProducto",
  "porReponer",
  "riesgoInventario",
  "reporteTributario",
  "saludMercadoLibre",
] as const;
