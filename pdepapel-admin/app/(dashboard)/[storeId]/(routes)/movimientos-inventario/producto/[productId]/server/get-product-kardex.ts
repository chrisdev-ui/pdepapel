import type { InventoryMovementType } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { subDays } from "date-fns";

import {
  describeWho,
  FAIR_LINKED_TYPES,
  KARDEX_METRICS_DAYS,
  ORDER_LINKED_TYPES,
  summarizeKardex,
  type KardexMetrics,
} from "@/lib/kardex";
import prismadb from "@/lib/prismadb";
import { resolveLowStockThreshold } from "@/lib/product-readiness";
import { getUnitsOnOrderByProduct, getUnitsSoldForProduct } from "@/lib/replenishment-db";

/** Ventana por defecto del kardex de producto. */
export const KARDEX_WINDOW_DAYS = 90;
/** Filas máximas dentro de la ventana por defecto. */
export const KARDEX_WINDOW_TAKE = 500;
/** Tope al pedir todo el historial. */
export const KARDEX_ALL_TAKE = 2000;

export interface GetProductKardexOptions {
  /** Levanta la ventana de 90 días (queda el tope `KARDEX_ALL_TAKE`). */
  all?: boolean;
  /** Solo un tipo de movimiento. */
  type?: InventoryMovementType;
  /** Para pruebas: «ahora». */
  now?: Date;
}

export interface KardexReference {
  kind: "order" | "restock" | "fair" | "note";
  label: string;
  secondary: string | null;
  href: string | null;
}

export interface KardexRow {
  id: string;
  type: InventoryMovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  cost: number | null;
  createdAt: Date;
  who: string;
  reference: KardexReference | null;
}

export interface ProductKardex {
  product: {
    id: string;
    name: string;
    sku: string;
    stock: number;
    acqPrice: number | null;
    isKit: boolean;
    supplier: { id: string; name: string } | null;
  };
  threshold: number;
  metrics: KardexMetrics;
  rows: KardexRow[];
  /** Saldo justo antes de la fila más antigua mostrada. */
  openingBalance: number;
  /** Movimientos anteriores a esa fila (cualquier tipo). */
  olderCount: number;
  /** Movimientos del producto en toda su vida. */
  totalCount: number;
  /** Primer movimiento registrado; `null` sin movimientos. */
  firstMovementAt: Date | null;
  /** Días de la ventana aplicada; `null` con `all`. */
  windowDays: number | null;
  /** El tope dejó filas por fuera. */
  hasMore: boolean;
}

/** Nombres de pila de Clerk por id; nunca tumba la página si Clerk falla. */
async function resolveFirstNames(userIds: Iterable<string>): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = Array.from(new Set(userIds));
  if (ids.length === 0) return names;
  try {
    const client = await clerkClient();
    await Promise.all(
      ids.map(async (userId) => {
        try {
          const user = await client.users.getUser(userId);
          if (user) names.set(userId, user.firstName?.trim() || user.username || "Usuario");
        } catch (error) {
          console.error(`[PRODUCT_KARDEX] No se pudo resolver el usuario ${userId}`, error);
        }
      }),
    );
  } catch (error) {
    console.error("[PRODUCT_KARDEX] Clerk no disponible; se muestra el kardex sin nombres", error);
  }
  return names;
}

const joinParts = (parts: (string | null | undefined)[]) => parts.map((part) => part?.trim()).filter(Boolean).join(" · ") || null;

/**
 * Kardex de un producto: cabecera, métricas de 30/90 días, cuadre contra
 * `Product.stock` y el historial con saldo. `null` si el producto no es de la tienda.
 */
export async function getProductKardex(storeId: string, productId: string, options: GetProductKardexOptions = {}): Promise<ProductKardex | null> {
  const now = options.now ?? new Date();
  const windowDays = options.all ? null : KARDEX_WINDOW_DAYS;
  const take = options.all ? KARDEX_ALL_TAKE : KARDEX_WINDOW_TAKE;
  const since = windowDays === null ? null : subDays(now, windowDays);

  const [product, store] = await Promise.all([
    prismadb.product.findFirst({
      where: { id: productId, storeId },
      select: {
        id: true,
        name: true,
        sku: true,
        stock: true,
        acqPrice: true,
        isKit: true,
        supplier: { select: { id: true, name: true } },
      },
    }),
    prismadb.store.findUnique({ where: { id: storeId }, select: { lowStockThreshold: true } }),
  ]);
  if (!product) return null;

  const baseWhere = { storeId, productId: product.id };

  const [movements, metricSource, latest, totalCount, first, sold30, sold90, onOrder] = await Promise.all([
    prismadb.inventoryMovement.findMany({
      where: {
        ...baseWhere,
        ...(options.type ? { type: options.type } : {}),
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: {
        id: true,
        type: true,
        quantity: true,
        previousStock: true,
        newStock: true,
        cost: true,
        reason: true,
        description: true,
        referenceId: true,
        createdAt: true,
        createdBy: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // Una fila de más para saber si el tope dejó movimientos por fuera.
      take: take + 1,
    }),
    // Las métricas no dependen del filtro ni de la ventana mostrada.
    prismadb.inventoryMovement.findMany({
      where: { ...baseWhere, createdAt: { gte: subDays(now, KARDEX_METRICS_DAYS), lte: now } },
      select: { type: true, quantity: true, createdAt: true },
    }),
    prismadb.inventoryMovement.findFirst({
      where: baseWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { newStock: true },
    }),
    prismadb.inventoryMovement.count({ where: baseWhere }),
    prismadb.inventoryMovement.findFirst({ where: baseWhere, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    // Ventas según pedidos pagados (directas y dentro de kits): la misma
    // cifra que Inventario, no el neto del libro.
    getUnitsSoldForProduct(storeId, product.id, 30, now),
    getUnitsSoldForProduct(storeId, product.id, 90, now),
    getUnitsOnOrderByProduct(storeId),
  ]);
  const threshold = resolveLowStockThreshold(store);

  const hasMore = movements.length > take;
  const visible = hasMore ? movements.slice(0, take) : movements;

  // El «periodo» es lo que se ve: el saldo inicial es el del último movimiento
  // anterior a la fila más antigua mostrada (o a la ventana, si no hay filas).
  const cutoff = visible.length > 0 ? visible[visible.length - 1].createdAt : since;
  const [olderCount, opening] = cutoff
    ? await Promise.all([
        prismadb.inventoryMovement.count({ where: { ...baseWhere, createdAt: { lt: cutoff } } }),
        prismadb.inventoryMovement.findFirst({
          where: { ...baseWhere, createdAt: { lt: cutoff } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { newStock: true },
        }),
      ])
    : [0, null];

  const orderIds = new Set<string>();
  const restockIds = new Set<string>();
  const fairIds = new Set<string>();
  const userIds = new Set<string>();
  for (const movement of visible) {
    if (movement.createdBy?.startsWith("USER_")) userIds.add(movement.createdBy.slice("USER_".length));
    if (!movement.referenceId) continue;
    if (ORDER_LINKED_TYPES.has(movement.type)) orderIds.add(movement.referenceId);
    else if (movement.type === "RESTOCK_RECEIVED") restockIds.add(movement.referenceId);
    else if (FAIR_LINKED_TYPES.has(movement.type)) fairIds.add(movement.referenceId);
  }

  const [names, orders, restockOrders, fairs] = await Promise.all([
    resolveFirstNames(userIds),
    orderIds.size > 0
      ? prismadb.order.findMany({
          where: { storeId, id: { in: Array.from(orderIds) } },
          select: { id: true, orderNumber: true, fullName: true, city: true },
        })
      : Promise.resolve([]),
    restockIds.size > 0
      ? prismadb.restockOrder.findMany({
          where: { storeId, id: { in: Array.from(restockIds) } },
          select: { id: true, orderNumber: true, supplier: { select: { name: true } } },
        })
      : Promise.resolve([]),
    fairIds.size > 0
      ? prismadb.fairEvent.findMany({
          where: { storeId, id: { in: Array.from(fairIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const restockById = new Map(restockOrders.map((order) => [order.id, order]));
  const fairsById = new Map(fairs.map((fair) => [fair.id, fair]));

  const noteReference = (reason: string | null, description: string | null): KardexReference | null => {
    const label = reason?.trim() || description?.trim();
    if (!label) return null;
    return {
      kind: "note",
      label: `“${label}”`,
      secondary: reason?.trim() && description?.trim() && description.trim() !== reason.trim() ? description.trim() : null,
      href: null,
    };
  };

  const rows: KardexRow[] = visible.map((movement) => {
    let reference: KardexReference | null = null;
    if (movement.referenceId && ORDER_LINKED_TYPES.has(movement.type)) {
      const order = ordersById.get(movement.referenceId);
      if (order) {
        reference = {
          kind: "order",
          label: order.orderNumber,
          secondary: joinParts([order.fullName, order.city]),
          href: `/${storeId}/pedidos/${order.id}`,
        };
      }
    } else if (movement.referenceId && movement.type === "RESTOCK_RECEIVED") {
      const restock = restockById.get(movement.referenceId);
      if (restock) {
        reference = {
          kind: "restock",
          label: restock.orderNumber,
          secondary: restock.supplier?.name ?? null,
          href: `/${storeId}/aprovisionamiento/${restock.id}`,
        };
      }
    } else if (movement.referenceId && FAIR_LINKED_TYPES.has(movement.type)) {
      const fair = fairsById.get(movement.referenceId);
      if (fair) {
        reference = { kind: "fair", label: fair.name, secondary: null, href: `/${storeId}/ferias/${fair.id}` };
      }
    }
    // Referencia borrada o movimiento sin referencia: queda la razón escrita.
    if (!reference) reference = noteReference(movement.reason, movement.description);

    return {
      id: movement.id,
      type: movement.type,
      quantity: movement.quantity,
      previousStock: movement.previousStock,
      newStock: movement.newStock,
      cost: movement.cost ?? null,
      createdAt: movement.createdAt,
      who: describeWho(movement.createdBy, movement.type, names),
      reference,
    };
  });

  return {
    product: {
      id: product.id,
      name: product.name,
      sku: product.sku,
      stock: product.stock,
      acqPrice: product.acqPrice ?? null,
      isKit: product.isKit,
      supplier: product.supplier ? { id: product.supplier.id, name: product.supplier.name } : null,
    },
    threshold,
    metrics: summarizeKardex(metricSource, {
      stock: product.stock,
      latest,
      now,
      sales: {
        sold30: sold30.direct + sold30.viaKits,
        sold90: sold90.direct + sold90.viaKits,
        viaKits30: sold30.viaKits,
        onOrder: onOrder.get(product.id) ?? 0,
        threshold,
      },
    }),
    rows,
    openingBalance: opening?.newStock ?? 0,
    olderCount,
    totalCount,
    firstMovementAt: first?.createdAt ?? null,
    windowDays,
    hasMore,
  };
}
