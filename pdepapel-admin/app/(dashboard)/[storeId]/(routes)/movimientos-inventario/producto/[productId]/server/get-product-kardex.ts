import type { InventoryMovementType } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { subDays } from "date-fns";

import {
  describeWho,
  KARDEX_METRICS_DAYS,
  summarizeKardex,
  type KardexMetrics,
} from "@/lib/kardex";
import { collectFairAnchors, describeFairSale, FAIR_SALE_HINT } from "@/lib/fair-kardex";
import { collectMovementActorIds } from "@/lib/movement-actor";
import { buildMovementReference, loadMovementReferences } from "@/lib/movement-reference";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";
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

/** La referencia la resuelve `lib/movement-reference.ts`, igual que la lista. */
export type { MovementReference as KardexReference } from "@/lib/movement-reference";

export interface KardexRow {
  id: string;
  type: InventoryMovementType;
  quantity: number;
  /** `null` en una fila derivada: no hay saldo porque no movió stock. */
  previousStock: number | null;
  newStock: number | null;
  cost: number | null;
  createdAt: Date;
  who: string;
  reference: import("@/lib/movement-reference").MovementReference | null;
  /**
   * Fila derivada al leer, no una fila de `InventoryMovement`. Hoy solo lo
   * vendido en una feria. No entra en el saldo ni en el cuadre.
   */
  derived?: { kind: "fair-sale"; hint: string };
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


/**
 * Kardex de un producto: cabecera, métricas de 30/90 días, cuadre contra
 * `Product.stock` y el historial con saldo. `null` si el producto no es de la tienda.
 */
export async function getProductKardex(storeId: string, productId: string, options: GetProductKardexOptions = {}): Promise<ProductKardex | null> {
  // Solo la dueña: el kardex muestra costo de compra y margen por movimiento.
  await requireStoreOwner(storeId);
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

  const [names, references] = await Promise.all([
    // Antes solo se resolvían los ids con prefijo `USER_`, así que la mayoría
    // de las filas de producción mostraba «—» en la columna «Quién».
    resolveFirstNames(collectMovementActorIds(visible)),
    loadMovementReferences(storeId, visible),
  ]);

  const rows: KardexRow[] = visible.map((movement) => {
    const reference = buildMovementReference(movement, references, storeId);

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

  // ── Ventas en feria ────────────────────────────────────────────────────
  // No existen como movimiento (ver `lib/fair-kardex.ts`); se derivan de lo
  // que la feria registró y se marcan como derivadas. Van después de armar
  // `rows` y del cuadre, que solo miran movimientos reales.
  const anchors = collectFairAnchors(visible);
  if (anchors.size > 0) {
    const fairItems = await prismadb.fairEventInventoryItem.findMany({
      where: { productId, fairEventId: { in: Array.from(anchors.keys()) } },
      select: { fairEventId: true, soldQuantity: true, damagedQuantity: true, lostQuantity: true },
    });
    for (const item of fairItems) {
      if (item.soldQuantity <= 0) continue;
      const anchor = anchors.get(item.fairEventId);
      if (!anchor) continue;
      const fair = references.fairs.get(item.fairEventId);
      const note = describeFairSale({ sold: item.soldQuantity, damaged: item.damagedQuantity, lost: item.lostQuantity });
      rows.push({
        id: `fair-sale:${item.fairEventId}`,
        // Es una venta presencial, así que cuenta como tal para quien filtre
        // por tipo; la insignia la distingue de una fila del kardex.
        type: "IN_PERSON_SALE",
        quantity: -item.soldQuantity,
        previousStock: null,
        newStock: null,
        cost: null,
        createdAt: anchor.settledAt,
        who: "—",
        reference: fair
          ? { kind: "fair", label: fair.name, secondary: note, href: `/${storeId}/ferias/${fair.id}` }
          : { kind: "note", label: note, secondary: null, href: null },
        derived: { kind: "fair-sale", hint: FAIR_SALE_HINT },
      });
    }
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

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
