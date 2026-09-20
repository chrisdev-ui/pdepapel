import type { InventoryMovementType } from "@prisma/client";

/**
 * Lo vendido en una feria, para que el kardex lo pueda mostrar.
 *
 * Una feria **no** deja un movimiento por cada venta, y es a propósito: las
 * unidades salen del stock cuando se reservan (`FESTIVAL_ALLOCATION`) y lo no
 * vendido vuelve al cerrar (`FESTIVAL_RETURN`). Escribir además un movimiento
 * por la venta descontaría el stock dos veces, y uno de cantidad cero rompería
 * la regla `previousStock + quantity = newStock` sobre la que se apoya la
 * tarjeta «Cuadre».
 *
 * Así que la venta en feria se **deriva al leer** y se marca como fila
 * derivada: se ve en el historial, no existe en `InventoryMovement` y no entra
 * en el saldo ni en el cuadre.
 *
 * Ojo con la aritmética fácil: `reservado − devuelto` **no** es lo vendido,
 * porque lo dañado y lo perdido en la feria tampoco vuelven. La cifra exacta
 * es `FairEventInventoryItem.soldQuantity`.
 */

export const FAIR_KARDEX_TYPES: ReadonlySet<InventoryMovementType> = new Set<InventoryMovementType>([
  "FESTIVAL_ALLOCATION",
  "FESTIVAL_RETURN",
]);

export interface FairAnchorInput {
  type: InventoryMovementType;
  referenceId: string | null;
  createdAt: Date;
}

export interface FairAnchor {
  fairEventId: string;
  /** Dónde se coloca la fila en el historial: el cierre si ya ocurrió. */
  settledAt: Date;
  /** Hubo retorno, es decir la feria ya se concilió. */
  closed: boolean;
}

/**
 * Las ferias que tocaron a este producto dentro de la ventana cargada, con la
 * fecha en la que conviene mostrar su venta.
 */
export function collectFairAnchors(movements: FairAnchorInput[]): Map<string, FairAnchor> {
  // Se guarda por separado la reserva y el retorno más recientes: el retorno
  // es cuando la feria quedó cuadrada, así que es la fecha que manda.
  const latest = new Map<string, { allocation: Date | null; settlement: Date | null }>();
  for (const movement of movements) {
    if (!movement.referenceId || !FAIR_KARDEX_TYPES.has(movement.type)) continue;
    const entry = latest.get(movement.referenceId) ?? { allocation: null, settlement: null };
    const key = movement.type === "FESTIVAL_RETURN" ? "settlement" : "allocation";
    const current = entry[key];
    if (!current || movement.createdAt > current) entry[key] = movement.createdAt;
    latest.set(movement.referenceId, entry);
  }

  const anchors = new Map<string, FairAnchor>();
  for (const [fairEventId, entry] of Array.from(latest.entries())) {
    const settledAt = entry.settlement ?? entry.allocation;
    if (!settledAt) continue;
    anchors.set(fairEventId, { fairEventId, settledAt, closed: entry.settlement !== null });
  }
  return anchors;
}

export interface FairSaleTally {
  sold: number;
  damaged: number;
  lost: number;
}

/** La línea secundaria de la fila: qué más pasó con lo reservado. */
export function describeFairSale(tally: FairSaleTally): string {
  const units = `${tally.sold.toLocaleString("es-CO")} ${tally.sold === 1 ? "unidad vendida" : "unidades vendidas"}`;
  const extra: string[] = [];
  if (tally.damaged > 0) extra.push(`${tally.damaged} ${tally.damaged === 1 ? "dañada" : "dañadas"}`);
  if (tally.lost > 0) extra.push(`${tally.lost} ${tally.lost === 1 ? "perdida" : "perdidas"}`);
  return extra.length > 0 ? `${units} · ${extra.join(" · ")}` : units;
}

/** Texto fijo de la insignia: no es un movimiento del kardex. */
export const FAIR_SALE_LABEL = "Venta en feria";
export const FAIR_SALE_HINT = "Las unidades salieron del stock al reservarlas para la feria.";
