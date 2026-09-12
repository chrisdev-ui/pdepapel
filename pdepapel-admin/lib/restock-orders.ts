import { RestockOrderStatus } from "@prisma/client";
import { z } from "zod";

/**
 * Reglas puras de los pedidos de aprovisionamiento: ciclo de vida, número de
 * pedido, cantidades por recibir y costo puesto en bodega. La API las hace
 * cumplir y el formulario solo muestra lo que existe.
 */

export const RESTOCK_STATUS_LABELS: Record<RestockOrderStatus, string> = {
  DRAFT: "Borrador",
  ORDERED: "Pedido al proveedor",
  PARTIALLY_RECEIVED: "Recibido en parte",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

export const RESTOCK_STATUS_TONES: Record<RestockOrderStatus, "slate" | "sky" | "lavender" | "mint" | "pink"> = {
  DRAFT: "slate",
  ORDERED: "sky",
  PARTIALLY_RECEIVED: "lavender",
  COMPLETED: "mint",
  CANCELLED: "pink",
};

/** Pasos del indicador de progreso (cancelado se pinta aparte). */
export const RESTOCK_STEPS: { status: RestockOrderStatus; label: string }[] = [
  { status: RestockOrderStatus.DRAFT, label: "Borrador" },
  { status: RestockOrderStatus.ORDERED, label: "Pedido al proveedor" },
  { status: RestockOrderStatus.PARTIALLY_RECEIVED, label: "Recibiendo" },
  { status: RestockOrderStatus.COMPLETED, label: "Completado" },
];

export interface RestockTransitionContext {
  /** Unidades ya recibidas en todo el pedido. */
  receivedUnits: number;
}

/**
 * Transiciones que una persona puede pedir desde el formulario. Las que
 * dependen de la mercancía (recibido en parte, completado por recepción) las
 * decide la ruta de recepción, no un selector.
 */
export function getAllowedRestockTransitions(from: RestockOrderStatus, context: RestockTransitionContext): RestockOrderStatus[] {
  const nothingReceived = context.receivedUnits <= 0;
  switch (from) {
    case RestockOrderStatus.DRAFT:
      return [RestockOrderStatus.ORDERED, RestockOrderStatus.CANCELLED];
    case RestockOrderStatus.ORDERED:
      return [RestockOrderStatus.COMPLETED, ...(nothingReceived ? [RestockOrderStatus.CANCELLED] : [])];
    case RestockOrderStatus.PARTIALLY_RECEIVED:
      return [RestockOrderStatus.COMPLETED];
    case RestockOrderStatus.CANCELLED:
      return [RestockOrderStatus.DRAFT];
    case RestockOrderStatus.COMPLETED:
    default:
      return [];
  }
}

export function canTransitionRestockOrder(from: RestockOrderStatus, to: RestockOrderStatus, context: RestockTransitionContext): boolean {
  if (from === to) return true;
  return getAllowedRestockTransitions(from, context).includes(to);
}

export function describeForbiddenRestockTransition(from: RestockOrderStatus, to: RestockOrderStatus, context: RestockTransitionContext): string {
  if (to === RestockOrderStatus.CANCELLED && context.receivedUnits > 0) {
    return `No se puede cancelar: ya se recibieron ${context.receivedUnits} unidades y el inventario las tiene. Cierra el pedido como completado o registra una devolución en Movimientos.`;
  }
  if (from === RestockOrderStatus.COMPLETED) {
    return "Un pedido completado no cambia de estado: es el historial de lo que llegó.";
  }
  if (to === RestockOrderStatus.PARTIALLY_RECEIVED) {
    return "«Recibido en parte» lo fija la recepción de mercancía, no se elige a mano.";
  }
  return `No se puede pasar de «${RESTOCK_STATUS_LABELS[from]}» a «${RESTOCK_STATUS_LABELS[to]}».`;
}

/** El pedido ya no admite cambios en líneas, proveedor ni envío. */
export function areRestockLinesLocked(status: RestockOrderStatus): boolean {
  return status !== RestockOrderStatus.DRAFT;
}

/** Estados en los que se puede recibir mercancía. */
export const RECEIVABLE_STATUSES: RestockOrderStatus[] = [RestockOrderStatus.ORDERED, RestockOrderStatus.PARTIALLY_RECEIVED];

// ---------------------------------------------------------------------------
// Número de pedido
// ---------------------------------------------------------------------------

const ORDER_NUMBER_PATTERN = /^PO-(\d+)$/;

export function parseRestockOrderNumber(orderNumber: string): number | null {
  const match = ORDER_NUMBER_PATTERN.exec(orderNumber.trim());
  return match ? Number.parseInt(match[1], 10) : null;
}

export function formatRestockOrderNumber(sequence: number): string {
  return `PO-${String(sequence).padStart(4, "0")}`;
}

/**
 * Siguiente número a partir de los existentes: el mayor más uno, nunca
 * `count + 1` (borrar un borrador bajaba el conteo y reutilizaba un número).
 * Convive con el formato antiguo sin ceros (`PO-1001`).
 */
export function nextRestockOrderNumber(existing: string[]): string {
  let max = 0;
  for (const value of existing) {
    const sequence = parseRestockOrderNumber(value);
    if (sequence !== null && sequence > max) max = sequence;
  }
  return formatRestockOrderNumber(max + 1);
}

// ---------------------------------------------------------------------------
// Entrada de la API
// ---------------------------------------------------------------------------

const round2 = (value: number) => Math.round(value * 100) / 100;

const lineSchema = z.object({
  productId: z.string().min(1, "Cada línea necesita un producto."),
  quantity: z.coerce.number().int("La cantidad debe ser un número entero.").min(1, "La cantidad mínima por línea es 1."),
  cost: z.coerce.number().min(0, "El costo unitario no puede ser negativo."),
});

export const restockOrderInputSchema = z.object({
  supplierId: z.string().min(1, "Elige un proveedor."),
  notes: z.string().trim().max(2000, "Las notas no pueden superar 2000 caracteres.").optional().nullable(),
  shippingCost: z.coerce.number().min(0, "El costo de envío no puede ser negativo.").default(0),
  items: z.array(lineSchema).min(1, "Agrega al menos un producto."),
  status: z.enum([RestockOrderStatus.DRAFT, RestockOrderStatus.ORDERED]).default(RestockOrderStatus.DRAFT),
});

export type RestockOrderInput = z.infer<typeof restockOrderInputSchema>;

/** Solo los campos que un pedido ya pedido sigue aceptando. */
export const restockOrderPatchSchema = z.object({
  notes: z.string().trim().max(2000, "Las notas no pueden superar 2000 caracteres.").optional().nullable(),
  status: z.nativeEnum(RestockOrderStatus).optional(),
  supplierId: z.string().min(1, "Elige un proveedor.").optional(),
  shippingCost: z.coerce.number().min(0, "El costo de envío no puede ser negativo.").optional(),
  items: z.array(lineSchema).min(1, "Agrega al menos un producto.").optional(),
});

export type RestockOrderPatch = z.infer<typeof restockOrderPatchSchema>;

export function summarizeLines(items: { quantity: number; cost: number }[]): { totalAmount: number; units: number } {
  return {
    totalAmount: round2(items.reduce((sum, item) => sum + item.quantity * item.cost, 0)),
    units: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

export function lineSubtotal(quantity: number, cost: number): number {
  return round2(quantity * cost);
}

// ---------------------------------------------------------------------------
// Recepción
// ---------------------------------------------------------------------------

export const receiptInputSchema = z.object({
  idempotencyKey: z
    .string()
    .trim()
    .min(8, "Falta la clave de la recepción.")
    .max(64, "La clave de la recepción es demasiado larga.")
    .regex(/^[A-Za-z0-9_-]+$/, "La clave de la recepción tiene caracteres no válidos."),
  updateCosts: z.boolean().default(true),
  assignSupplier: z.boolean().default(true),
  lines: z
    .array(
      z.object({
        restockOrderItemId: z.string().min(1),
        quantity: z.coerce.number().int("Las cantidades recibidas deben ser enteras.").min(0, "Una cantidad recibida no puede ser negativa."),
        allowExcess: z.boolean().default(false),
      }),
    )
    .min(1, "No hay líneas que recibir."),
});

export type ReceiptInput = z.infer<typeof receiptInputSchema>;

export interface ReceivableLine {
  id: string;
  productId: string;
  quantity: number;
  quantityReceived: number;
  cost: number;
}

export interface PlannedReceiptLine {
  restockOrderItemId: string;
  productId: string;
  quantity: number;
  excess: number;
  unitCost: number;
  landedUnitCost: number;
}

export interface ReceiptPlan {
  lines: PlannedReceiptLine[];
  receivedUnits: number;
  excessUnits: number;
}

export type ReceiptPlanError =
  | { kind: "unknown-line"; restockOrderItemId: string }
  | { kind: "excess-not-confirmed"; restockOrderItemId: string; remaining: number; requested: number }
  | { kind: "nothing-to-receive" };

export function remainingUnits(line: { quantity: number; quantityReceived: number }): number {
  return Math.max(0, line.quantity - line.quantityReceived);
}

/**
 * Factor de costo puesto en bodega: el envío se reparte proporcionalmente
 * sobre la mercancía. Sin mercancía valorada no hay reparto (antes
 * `totalAmount || 1` disparaba factores absurdos).
 */
export function landedCostFactor(totalAmount: number, shippingCost: number): number {
  if (!(totalAmount > 0) || !(shippingCost > 0)) return 1;
  return 1 + shippingCost / totalAmount;
}

export function landedUnitCost(unitCost: number, totalAmount: number, shippingCost: number): number {
  return round2(unitCost * landedCostFactor(totalAmount, shippingCost));
}

/**
 * Convierte lo que el diálogo pide recibir en líneas concretas: tope en lo
 * que falta salvo confirmación explícita del excedente, cantidades cero
 * ignoradas, costo puesto en bodega por línea.
 */
export function planReceipt(
  order: { totalAmount: number; shippingCost: number; items: ReceivableLine[] },
  input: Pick<ReceiptInput, "lines">,
): { ok: true; plan: ReceiptPlan } | { ok: false; error: ReceiptPlanError } {
  const byId = new Map(order.items.map((item) => [item.id, item]));
  const lines: PlannedReceiptLine[] = [];
  for (const requested of input.lines) {
    const item = byId.get(requested.restockOrderItemId);
    if (!item) return { ok: false, error: { kind: "unknown-line", restockOrderItemId: requested.restockOrderItemId } };
    if (requested.quantity <= 0) continue;
    const remaining = remainingUnits(item);
    const excess = Math.max(0, requested.quantity - remaining);
    if (excess > 0 && !requested.allowExcess) {
      return { ok: false, error: { kind: "excess-not-confirmed", restockOrderItemId: item.id, remaining, requested: requested.quantity } };
    }
    lines.push({
      restockOrderItemId: item.id,
      productId: item.productId,
      quantity: requested.quantity,
      excess,
      unitCost: item.cost,
      landedUnitCost: landedUnitCost(item.cost, order.totalAmount, order.shippingCost),
    });
  }
  if (lines.length === 0) return { ok: false, error: { kind: "nothing-to-receive" } };
  return {
    ok: true,
    plan: {
      lines,
      receivedUnits: lines.reduce((sum, line) => sum + line.quantity, 0),
      excessUnits: lines.reduce((sum, line) => sum + line.excess, 0),
    },
  };
}

export function describeReceiptPlanError(error: ReceiptPlanError): string {
  switch (error.kind) {
    case "unknown-line":
      return "Una de las líneas ya no pertenece a este pedido. Recarga la página.";
    case "excess-not-confirmed":
      return `Una línea recibe ${error.requested} unidades y solo faltaban ${error.remaining}. Confirma el excedente para registrarlo.`;
    case "nothing-to-receive":
      return "Ingresa al menos una cantidad mayor que cero.";
  }
}

/** Estado que corresponde a las líneas después de una recepción. */
export function deriveRestockStatus(items: { quantity: number; quantityReceived: number }[], current: RestockOrderStatus): RestockOrderStatus {
  if (items.length === 0) return current;
  const allReceived = items.every((item) => item.quantityReceived >= item.quantity);
  const someReceived = items.some((item) => item.quantityReceived > 0);
  if (allReceived) return RestockOrderStatus.COMPLETED;
  if (someReceived) return RestockOrderStatus.PARTIALLY_RECEIVED;
  return current;
}

export interface RestockProgress {
  orderedUnits: number;
  receivedUnits: number;
  remainingUnits: number;
  lineCount: number;
  linesComplete: number;
}

export function getRestockProgress(items: { quantity: number; quantityReceived: number }[]): RestockProgress {
  const orderedUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const receivedUnits = items.reduce((sum, item) => sum + item.quantityReceived, 0);
  return {
    orderedUnits,
    receivedUnits,
    remainingUnits: items.reduce((sum, item) => sum + remainingUnits(item), 0),
    lineCount: items.length,
    linesComplete: items.filter((item) => item.quantityReceived >= item.quantity).length,
  };
}

/** Transporte por unidad que queda en el producto al actualizar costos: la parte del envío. */
export function transportationShare(unitCost: number, totalAmount: number, shippingCost: number): number {
  return round2(landedUnitCost(unitCost, totalAmount, shippingCost) - unitCost);
}
