import type { MovementType } from "@/lib/inventory-constants";

/**
 * Qué puede registrar una persona a mano, y por qué.
 *
 * Antes el motivo era texto libre: 464 cadenas distintas para 3.388
 * movimientos, con cuatro formas de decir «stock inicial», mezcla de español e
 * inglés y cosas como «reconteo» sueltas. Dentro de seis meses eso no explica
 * nada. Ahora el motivo es una categoría de esta lista y el texto libre queda
 * como nota opcional, en `description`.
 *
 * Las filas históricas se quedan como están: no se reclasifican.
 */

export type MovementSign = "add" | "subtract" | "both";

export interface MovementReasonOption {
  id: string;
  label: string;
}

export interface MovementIntent {
  /** El tipo que se guarda en `InventoryMovement.type`. */
  id: MovementType;
  label: string;
  /** Una línea que explica cuándo se usa, para la tarjeta. */
  hint: string;
  sign: MovementSign;
  reasons: MovementReasonOption[];
}

export const MOVEMENT_INTENTS: MovementIntent[] = [
  {
    id: "MANUAL_ADJUSTMENT",
    label: "Conteo físico",
    hint: "Cuadrar con lo contado",
    sign: "both",
    reasons: [
      { id: "conteo-mensual", label: "Conteo mensual" },
      { id: "cuadre-kardex", label: "Cuadre del kardex" },
      { id: "reconteo-estante", label: "Reconteo de estante" },
      { id: "diferencia-feria", label: "Diferencia después de una feria" },
      { id: "error-digitacion", label: "Error de digitación" },
    ],
  },
  {
    id: "DAMAGE",
    label: "Daño",
    hint: "Se rompió o se mojó",
    sign: "subtract",
    reasons: [
      { id: "roto-bodega", label: "Se dañó en la bodega" },
      { id: "llego-dañado", label: "Llegó dañado del proveedor" },
      { id: "dañado-feria", label: "Se dañó en una feria" },
    ],
  },
  {
    id: "LOST",
    label: "Pérdida",
    hint: "No aparece",
    sign: "subtract",
    reasons: [
      { id: "no-aparece", label: "No apareció en el conteo" },
      { id: "perdido-envio", label: "Se perdió en un envío" },
      { id: "faltante", label: "Faltante sin explicación" },
    ],
  },
  {
    id: "STORE_USE",
    label: "Uso interno",
    hint: "Se usó en la tienda",
    sign: "subtract",
    reasons: [
      { id: "muestra-tienda", label: "Muestra en la tienda" },
      { id: "material-empaque", label: "Material de empaque" },
      { id: "fotos", label: "Fotos del catálogo" },
    ],
  },
  {
    id: "PROMOTION",
    label: "Obsequio",
    hint: "Regalo o muestra",
    sign: "subtract",
    reasons: [
      { id: "regalo-clienta", label: "Regalo a una clienta" },
      { id: "muestra-feria", label: "Muestra para una feria" },
      { id: "sorteo", label: "Sorteo o colaboración" },
    ],
  },
  {
    id: "RETURN",
    label: "Devolución",
    hint: "Una clienta devolvió",
    sign: "add",
    reasons: [
      { id: "devolucion-clienta", label: "Devolución de una clienta" },
      { id: "devolucion-feria", label: "Devolución de una feria" },
      { id: "reingreso", label: "Producto reingresado" },
    ],
  },
  {
    id: "INITIAL_INTAKE",
    label: "Ingreso inicial",
    hint: "Stock que entra sin orden de compra",
    sign: "add",
    reasons: [
      { id: "stock-encontrado", label: "Stock encontrado en bodega" },
      { id: "carga-inicial", label: "Carga inicial del producto" },
      { id: "traslado", label: "Traslado desde otro punto" },
    ],
  },
];

export const findMovementIntent = (id: string | null | undefined): MovementIntent | undefined =>
  MOVEMENT_INTENTS.find((intent) => intent.id === id);

export const findMovementReason = (intentId: string | null | undefined, reasonId: string | null | undefined) =>
  findMovementIntent(intentId)?.reasons.find((reason) => reason.id === reasonId);

/** El signo que impone la intención; «both» deja elegir a quien registra. */
export function resolveIntentSign(intent: MovementIntent, requested: "add" | "subtract"): "add" | "subtract" {
  return intent.sign === "both" ? requested : intent.sign;
}

/**
 * Lo que queda escrito en `reason`. Se guarda el texto, no el id: el kardex lo
 * lee una persona, y un id no le dice nada dentro de seis meses.
 */
export function composeMovementReason(intentId: string, reasonId: string): string | null {
  const intent = findMovementIntent(intentId);
  const reason = findMovementReason(intentId, reasonId);
  if (!intent || !reason) return null;
  return `${intent.label} · ${reason.label}`;
}
