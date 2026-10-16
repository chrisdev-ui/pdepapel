import { MERCADOLIBRE_FEE_RATE_ESTIMATE, MERCADOLIBRE_SHIPPING_ESTIMATE, suggestMercadoLibrePrice } from "@/lib/mercadolibre/listing-margin";
import { LEGACY_TRANSPORT_FILL } from "@/lib/product-costs";
import { transportationShare } from "@/lib/restock-orders";

/**
 * Corrección de «Envío y otros gastos por unidad» (`Product.transportationCost`).
 * El relleno del 2026-09-11 (prisma/manual-migrations/20260911_backfill_product_transportation_cost.sql)
 * puso 1.000 en todo producto que tenía 0 o vacío, y el formulario lo sembró
 * en 1.000 hasta el 2026-09-18. La regla aprobada: el envío real por unidad de
 * la última recepción, repartido igual que la recepción; sin recepción, null
 * («no registrado»). Nunca un valor inventado. Puro: lo usan el plan de solo
 * lectura y el guion que escribe.
 */
export const LEGACY_TRANSPORT = LEGACY_TRANSPORT_FILL;
/** Despliegue en producción de e6a5507e: la columna y el relleno se aplicaron justo antes. */
export const BACKFILL_DEPLOYED_AT = new Date("2026-09-11T13:25:58Z");
/** Primer despliegue en producción con b462c9cd: el formulario deja de sembrar 1.000. */
export const FORM_DEFAULT_REMOVED_AT = new Date("2026-09-18T17:08:49Z");
/** Un envío por unidad mayor a esto (sobre el precio) lo revisa Paula. */
export const SHARE_OF_PRICE_TO_REVIEW = 0.25;

export type TransportGroup =
  /** Creado antes del relleno y con 1.000: lo puso el relleno. */
  | "a-relleno"
  /** Creado mientras el formulario sembraba 1.000 y con 1.000. */
  | "b1-formulario"
  /** Creado después, con 1.000: copiado (duplicar, convertir en variantes) o escrito a mano. */
  | "b2-despues"
  /** Otro valor, promediado en una recepción con «actualizar costos» contra un 1.000 previo. */
  | "d-promediado";

export function transportGroup(product: { createdAt: Date; transportationCost: number | null; averagedAfterBackfill: boolean }): TransportGroup | null {
  const value = product.transportationCost;
  if (value === LEGACY_TRANSPORT) {
    if (product.createdAt < BACKFILL_DEPLOYED_AT) return "a-relleno";
    if (product.createdAt < FORM_DEFAULT_REMOVED_AT) return "b1-formulario";
    return "b2-despues";
  }
  if (value !== null && value !== 0 && product.averagedAfterBackfill) return "d-promediado";
  return null;
}

/** La última recepción del producto: lo que la recepción guardó por línea, o la línea del pedido recibido. */
export type LastReceipt =
  | { kind: "recepcion"; orderNumber: string | null; at: Date; unitCost: number; landedUnitCost: number }
  | { kind: "pedido"; orderNumber: string | null; at: Date; unitCost: number; totalAmount: number; shippingCost: number };

/** El envío real por unidad de esa recepción, como lo calcula la recepción; sin recepción, null. */
export function proposedTransport(receipt: LastReceipt | null): number | null {
  if (!receipt) return null;
  if (receipt.kind === "recepcion") return Math.max(0, Math.round((receipt.landedUnitCost - receipt.unitCost) * 100) / 100);
  return transportationShare(receipt.unitCost, receipt.totalAmount, receipt.shippingCost);
}

const unitCost = (acqPrice: number | null, transport: number | null) => (acqPrice === null ? null : acqPrice + (transport ?? 0));
const margin = (price: number, cost: number | null) => (cost === null || price <= 0 ? null : (price - cost) / price);

export interface PlanProduct {
  id: string;
  sku: string | null;
  name: string;
  price: number;
  acqPrice: number | null;
  transportationCost: number | null;
  stock: number;
  reservedUnits: number;
  createdAt: Date;
  /** Archivado: misma regla, sin revisión (puede volver a activarse). */
  isArchived: boolean;
  averagedAfterBackfill: boolean;
  convertedVariant: boolean;
  lastReceipt: LastReceipt | null;
}

export interface PlanRow {
  id: string;
  sku: string | null;
  name: string;
  grupo: TransportGroup;
  archivado: boolean;
  expectedTransport: number | null;
  newTransport: number | null;
  source: string;
  price: number;
  acqPrice: number | null;
  available: number;
  costBefore: number | null;
  costAfter: number | null;
  marginBefore: number | null;
  marginAfter: number | null;
  exceptions: string[];
  aprobado: boolean;
}

export function planRow(product: PlanProduct): PlanRow | null {
  const grupo = transportGroup(product);
  if (!grupo) return null;
  const newTransport = proposedTransport(product.lastReceipt);
  if (newTransport === product.transportationCost) return null;
  const available = Math.max(0, product.stock - product.reservedUnits);
  const costBefore = unitCost(product.acqPrice, product.transportationCost);
  const costAfter = unitCost(product.acqPrice, newTransport);
  const marginBefore = margin(product.price, costBefore);
  const marginAfter = margin(product.price, costAfter);
  // Que el margen suba al quitar un 1.000 inventado es lo esperado: no se revisa. Sí lo que sigue raro después de corregir.
  const exceptions = product.isArchived
    ? []
    : [
        ...(grupo === "b2-despues" ? [product.convertedVariant ? "1.000 copiado al convertir en variantes" : "1.000 después del 18 de septiembre: copiado al duplicar o escrito a mano"] : []),
        ...(grupo === "d-promediado" ? ["el valor salió de promediar una recepción con el 1.000"] : []),
        ...(newTransport !== null && product.price > 0 && newTransport > SHARE_OF_PRICE_TO_REVIEW * product.price ? ["el envío real por unidad pasa del 25 % del precio"] : []),
        ...(costAfter !== null && product.price < costAfter ? ["sigue por debajo del costo después de corregir"] : []),
        ...(costAfter !== null && costBefore !== null && costAfter > costBefore ? ["el margen baja: el envío real pasa de lo que tenía"] : []),
      ];
  const r = product.lastReceipt;
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    grupo,
    archivado: product.isArchived,
    expectedTransport: product.transportationCost,
    newTransport,
    source: r ? `${r.kind === "recepcion" ? "recepción" : "pedido"} ${r.orderNumber ?? "sin número"} (${r.at.toISOString().slice(0, 10)})` : "sin recepción: no registrado",
    price: product.price,
    acqPrice: product.acqPrice,
    available,
    costBefore,
    costAfter,
    marginBefore,
    marginAfter,
    exceptions,
    aprobado: exceptions.length === 0,
  };
}

export interface ListingImpact {
  listingId: string;
  productId: string;
  status: string;
  price: number | null;
  costFloorBefore: number | null;
  costFloorAfter: number | null;
  breakevenBefore: number | null;
  breakevenAfter: number | null;
  /** En venta y su precio queda por debajo del nuevo costo por unidad. */
  liveBelowNewFloor: boolean;
  /** Tiene una pérdida autorizada que con el costo corregido ya no hace falta. */
  overrideNoLongerNeeded: boolean;
}

/** El piso de costo de Mercado Libre: adquisición más envío por unidad; sin adquisición, no hay piso (lib/product-costs.ts). */
const costFloor = (acqPrice: number | null, transport: number | null) => (acqPrice === null || acqPrice <= 0 ? null : acqPrice + (transport !== null && transport > 0 ? transport : 0));
const breakeven = (floor: number | null) =>
  floor === null ? null : suggestMercadoLibrePrice({ unitCost: floor, shippingCost: MERCADOLIBRE_SHIPPING_ESTIMATE, feeRate: MERCADOLIBRE_FEE_RATE_ESTIMATE, targetNet: 0 });

export function listingImpact(
  listing: { id: string; productId: string; status: string; price: number | null; hasBelowCostOverride: boolean },
  row: Pick<PlanRow, "acqPrice" | "expectedTransport" | "newTransport">,
): ListingImpact {
  const before = costFloor(row.acqPrice, row.expectedTransport);
  const after = costFloor(row.acqPrice, row.newTransport);
  return {
    listingId: listing.id,
    productId: listing.productId,
    status: listing.status,
    price: listing.price,
    costFloorBefore: before,
    costFloorAfter: after,
    breakevenBefore: breakeven(before),
    breakevenAfter: breakeven(after),
    liveBelowNewFloor: listing.status === "ACTIVE" && listing.price !== null && after !== null && listing.price < after,
    overrideNoLongerNeeded: listing.hasBelowCostOverride && listing.price !== null && (after === null || listing.price >= after),
  };
}

/** Una fila del plan aprobado por la regla, tal como la guarda el plan de solo lectura. */
export interface RuleRow {
  id: string;
  archivado: boolean;
  expectedTransport: number | null;
  newTransport: number | null;
}

/** Una excepción con la decisión de Paula. */
export interface ExceptionDecision {
  id: string;
  expectedTransport: number | null;
  newTransport: number | null;
  decision: "pendiente" | "aplicar" | "dejar" | "otro valor";
  otroValor?: number | null;
}

export interface TransportWrite {
  id: string;
  expected: number | null;
  value: number | null;
}

/**
 * Lo que se escribe: todas las filas de la regla (activos y archivados) y, de
 * las excepciones, solo lo que Paula marcó. Un id repetido o un valor inválido
 * detiene todo antes de escribir.
 */
export function buildTransportWrites(rule: RuleRow[], exceptions: ExceptionDecision[] = []) {
  const writes: TransportWrite[] = [];
  const counts = { reglaActivos: 0, reglaArchivados: 0, excepcionesAplicar: 0, excepcionesOtroValor: 0, excepcionesDejar: 0, excepcionesPendientes: 0 };
  const seen = new Set<string>();
  const add = (write: TransportWrite) => {
    if (seen.has(write.id)) throw new Error(`${write.id}: aparece dos veces`);
    if (write.value !== null && (!Number.isFinite(write.value) || write.value < 0)) throw new Error(`${write.id}: valor inválido ${write.value}`);
    if (write.value === write.expected) return;
    seen.add(write.id);
    writes.push(write);
  };
  for (const row of rule) {
    add({ id: row.id, expected: row.expectedTransport, value: row.newTransport });
    if (row.archivado) counts.reglaArchivados += 1;
    else counts.reglaActivos += 1;
  }
  for (const row of exceptions) {
    if (row.decision === "aplicar") {
      add({ id: row.id, expected: row.expectedTransport, value: row.newTransport });
      counts.excepcionesAplicar += 1;
    } else if (row.decision === "otro valor") {
      if (typeof row.otroValor !== "number") throw new Error(`${row.id}: «otro valor» sin número`);
      add({ id: row.id, expected: row.expectedTransport, value: row.otroValor });
      counts.excepcionesOtroValor += 1;
    } else if (row.decision === "dejar") counts.excepcionesDejar += 1;
    else counts.excepcionesPendientes += 1;
  }
  return { writes, counts };
}

