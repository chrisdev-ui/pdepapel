import type { InventoryMovementType } from "@prisma/client";

import type { TintTone } from "@/components/ui/tint-badge";
import { computeReplenishment } from "@/lib/replenishment";

/**
 * Kardex de un producto: matemática pura y etiquetas. Sin Prisma ni React para
 * que el cargador y la página compartan una sola fuente de verdad.
 */

/** Etiqueta corta por tipo de movimiento (la lista general usa las largas de `inventory-constants`). */
export const MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  ORDER_PLACED: "Venta",
  IN_PERSON_SALE: "Venta presencial",
  // Una feria reserva stock al abrir y devuelve lo no vendido al cerrar; lo
  // vendido es la diferencia, no un movimiento aparte.
  FESTIVAL_ALLOCATION: "Reserva de feria",
  FESTIVAL_RETURN: "Retorno de feria",
  RESTOCK_RECEIVED: "Recepción",
  PURCHASE: "Recepción",
  MANUAL_ADJUSTMENT: "Ajuste",
  DAMAGE: "Daño",
  LOST: "Pérdida",
  RETURN: "Devolución",
  ORDER_CANCELLED: "Cancelación",
  STORE_USE: "Uso interno",
  PROMOTION: "Promoción",
  INITIAL_INTAKE: "Ingreso inicial",
  INITIAL_MIGRATION: "Migración",
};

export const MOVEMENT_TONES: Record<InventoryMovementType, TintTone> = {
  ORDER_PLACED: "sky",
  IN_PERSON_SALE: "sky",
  FESTIVAL_ALLOCATION: "lavender",
  FESTIVAL_RETURN: "lavender",
  RESTOCK_RECEIVED: "mint",
  PURCHASE: "mint",
  INITIAL_INTAKE: "mint",
  INITIAL_MIGRATION: "slate",
  MANUAL_ADJUSTMENT: "cream",
  STORE_USE: "cream",
  PROMOTION: "cream",
  DAMAGE: "pink",
  LOST: "pink",
  RETURN: "mint",
  ORDER_CANCELLED: "mint",
};

/** Salidas por venta (se cuentan en valor absoluto). */
export const SALE_TYPES: ReadonlySet<InventoryMovementType> = new Set<InventoryMovementType>(["ORDER_PLACED", "IN_PERSON_SALE"]);
/** Entradas desde proveedor. */
export const RECEIPT_TYPES: ReadonlySet<InventoryMovementType> = new Set<InventoryMovementType>(["RESTOCK_RECEIVED", "PURCHASE"]);
/** Ajustes y pérdidas: lo que no es venta, recepción ni feria. */
export const ADJUSTMENT_TYPES: ReadonlySet<InventoryMovementType> = new Set<InventoryMovementType>([
  "MANUAL_ADJUSTMENT",
  "DAMAGE",
  "LOST",
  "STORE_USE",
  "PROMOTION",
]);
/** Movimientos cuya referencia es un pedido. */
export const ORDER_LINKED_TYPES: ReadonlySet<InventoryMovementType> = new Set<InventoryMovementType>([
  "ORDER_PLACED",
  "ORDER_CANCELLED",
  "IN_PERSON_SALE",
]);
export const FAIR_LINKED_TYPES: ReadonlySet<InventoryMovementType> = new Set<InventoryMovementType>([
  "FESTIVAL_ALLOCATION",
  "FESTIVAL_RETURN",
]);

export const KARDEX_SALES_DAYS = 30;
export const KARDEX_METRICS_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface KardexMovementInput {
  type: InventoryMovementType;
  quantity: number;
  createdAt: Date | string;
}

/** Ventas del producto según pedidos pagados (la misma cifra que Inventario). */
export interface KardexSales {
  sold30: number;
  sold90: number;
  /** Parte de `sold30` vendida dentro de kits. */
  viaKits30?: number;
  onOrder?: number;
  threshold?: number;
}

export interface KardexMetrics {
  /** Unidades vendidas en los últimos 30 días (pedidos pagados; sin `sales`, el neto del libro). */
  sold30: number;
  /** Unidades vendidas en los últimos 90 días; 0 cuando el cálculo sale del libro. */
  sold90: number;
  /** Parte de `sold30` vendida dentro de kits. */
  viaKits30: number;
  /** Ritmo semanal (ventana de 30 días, o 90 si no vendió en 30). */
  weeklyRate: number;
  /** Ventana del ritmo; `null` sin ventas. */
  rateWindowDays: 30 | 90 | null;
  /** Días que aguanta el stock actual a ese ritmo; `null` sin ventas. */
  coverDays: number | null;
  /** Unidades recibidas de proveedor en 90 días. */
  received90: number;
  /** Recepciones (movimientos) en 90 días. */
  receipts90: number;
  adjustments90: {
    /** Suma con signo de ajustes, daños, pérdidas, uso interno y promociones. */
    total: number;
    /** Movimientos por tipo dentro de esos 90 días. */
    byType: Partial<Record<InventoryMovementType, number>>;
  };
  balanced: boolean;
  /** `newStock` del último movimiento; `null` si el producto no tiene movimientos. */
  latestBalance: number | null;
}

const toTime = (value: Date | string) => (value instanceof Date ? value : new Date(value)).getTime();

/**
 * El saldo del último movimiento debe ser el stock actual: si no, alguien
 * tocó `Product.stock` sin pasar por el kardex (o un movimiento falló a medias).
 * Sin movimientos no hay nada que comparar y se considera cuadrado.
 */
export function computeRunningBalanceCheck(latest: { newStock: number } | null | undefined, stock: number): { balanced: boolean; latestBalance: number | null } {
  if (!latest) return { balanced: true, latestBalance: null };
  return { balanced: latest.newStock === stock, latestBalance: latest.newStock };
}

/**
 * Métricas del kardex a partir de los movimientos de los últimos 90 días
 * (cualquier tipo). `movements` puede traer filas más viejas: se filtran aquí.
 * Con `sales` (pedidos pagados), las ventas, el ritmo y la cobertura salen de
 * la misma regla que Inventario; sin él, del neto de ventas del libro.
 */
export function summarizeKardex(
  movements: KardexMovementInput[],
  options: { stock: number; latest: { newStock: number } | null | undefined; now?: Date; sales?: KardexSales },
): KardexMetrics {
  const now = options.now ?? new Date();
  const since30 = now.getTime() - KARDEX_SALES_DAYS * DAY_MS;
  const since90 = now.getTime() - KARDEX_METRICS_DAYS * DAY_MS;

  let sold = 0;
  let cancelled = 0;
  let received90 = 0;
  let receipts90 = 0;
  let adjustmentsTotal = 0;
  const byType: Partial<Record<InventoryMovementType, number>> = {};

  for (const movement of movements) {
    const time = toTime(movement.createdAt);
    if (time < since90 || time > now.getTime()) continue;

    if (time >= since30) {
      if (SALE_TYPES.has(movement.type)) sold += Math.abs(movement.quantity);
      else if (movement.type === "ORDER_CANCELLED") cancelled += Math.abs(movement.quantity);
    }
    if (RECEIPT_TYPES.has(movement.type)) {
      received90 += Math.max(0, movement.quantity);
      receipts90 += 1;
    }
    if (ADJUSTMENT_TYPES.has(movement.type)) {
      adjustmentsTotal += movement.quantity;
      byType[movement.type] = (byType[movement.type] ?? 0) + 1;
    }
  }

  const ledgerSold30 = Math.max(0, sold - cancelled);
  const sales = options.sales ?? { sold30: ledgerSold30, sold90: 0 };
  const signal = computeReplenishment({ stock: options.stock, sold30: sales.sold30, sold90: sales.sold90, onOrder: sales.onOrder, threshold: sales.threshold });

  return {
    sold30: sales.sold30,
    sold90: sales.sold90,
    viaKits30: sales.viaKits30 ?? 0,
    weeklyRate: signal.weeklyRate,
    rateWindowDays: signal.rateWindowDays,
    coverDays: signal.coverDays,
    received90,
    receipts90,
    adjustments90: { total: adjustmentsTotal, byType },
    ...computeRunningBalanceCheck(options.latest, options.stock),
  };
}

/**
 * Quién registró el movimiento. `names` trae el nombre de pila por id de Clerk
 * (sin el prefijo `USER_`), ya resuelto en el servidor.
 */
export function describeWho(createdBy: string | null | undefined, type: InventoryMovementType, names: ReadonlyMap<string, string>): string {
  if (!createdBy) return type === "ORDER_PLACED" ? "Tienda en línea" : "—";
  if (createdBy.startsWith("SYSTEM")) return "Sistema";
  const clerkId = createdBy.startsWith("USER_") ? createdBy.slice("USER_".length) : createdBy;
  return names.get(clerkId)?.trim() || "Usuario";
}

const BOGOTA = "America/Bogota";
const dayFormatter = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: BOGOTA });
const timeFormatter = new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: BOGOTA });
const monthFormatter = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: BOGOTA });

/** «11 sept · 17:08» en hora de Bogotá. */
export function formatKardexDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  // es-CO intercala «de» («11 de sept»); se arma desde las partes para dejar «11 sept».
  const parts = dayFormatter.formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = (parts.find((part) => part.type === "month")?.value ?? "").replace(/\.$/, "");
  return `${day} ${month} · ${timeFormatter.format(date)}`;
}

/** «5 ago» en hora de Bogotá (sin hora). */
export function formatKardexDay(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = dayFormatter.formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = (parts.find((part) => part.type === "month")?.value ?? "").replace(/\.$/, "");
  return `${day} ${month}`;
}

/** «septiembre de 2025» en hora de Bogotá. */
export function formatKardexMonth(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return monthFormatter.format(date);
}

/** «+3» / «−2» para la columna Cantidad. */
export function formatSignedQuantity(quantity: number): string {
  if (quantity < 0) return `−${Math.abs(quantity).toLocaleString("es-CO")}`;
  return `+${quantity.toLocaleString("es-CO")}`;
}

/** «2 ajustes · 1 daño» para la nota de la tarjeta de ajustes. */
export function describeAdjustmentCounts(byType: Partial<Record<InventoryMovementType, number>>): string {
  const plural: Partial<Record<InventoryMovementType, [string, string]>> = {
    MANUAL_ADJUSTMENT: ["ajuste", "ajustes"],
    DAMAGE: ["daño", "daños"],
    LOST: ["pérdida", "pérdidas"],
    STORE_USE: ["uso interno", "usos internos"],
    PROMOTION: ["promoción", "promociones"],
  };
  const parts = (Object.keys(plural) as InventoryMovementType[])
    .filter((type) => (byType[type] ?? 0) > 0)
    .map((type) => {
      const count = byType[type] ?? 0;
      const [one, many] = plural[type]!;
      return `${count} ${count === 1 ? one : many}`;
    });
  return parts.length > 0 ? parts.join(" · ") : "Sin ajustes en 90 días";
}
