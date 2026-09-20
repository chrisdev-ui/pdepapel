export type MovementType =
  | "ORDER_PLACED"
  | "ORDER_CANCELLED"
  | "MANUAL_ADJUSTMENT"
  | "INITIAL_MIGRATION"
  | "RETURN"
  | "DAMAGE"
  | "LOST"
  | "PROMOTION"
  | "PURCHASE"
  | "INITIAL_INTAKE"
  | "RESTOCK_RECEIVED"
  | "STORE_USE"
  | "FESTIVAL_ALLOCATION"
  | "FESTIVAL_RETURN"
  | "IN_PERSON_SALE"
  | "VARIANT_CONVERSION";

/**
 * **El** catálogo de etiquetas por tipo de movimiento. Antes había dos (este y
 * `MOVEMENT_LABELS` en `lib/kardex.ts`) y el mismo tipo se llamaba distinto en
 * la lista y en el formulario que lo creaba. `lib/kardex.ts` reexporta este.
 *
 * Sin el signo entre paréntesis: el sentido se ve en la cantidad y, al
 * registrar a mano, en la tarjeta que se elige.
 */
export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  ORDER_PLACED: "Venta",
  ORDER_CANCELLED: "Cancelación",
  MANUAL_ADJUSTMENT: "Ajuste",
  INITIAL_MIGRATION: "Migración",
  RETURN: "Devolución",
  DAMAGE: "Daño",
  LOST: "Pérdida",
  PROMOTION: "Promoción",
  // «Recepción» es la orden de aprovisionamiento recibida; «Compra» es la
  // entrada suelta. Antes las dos decían «Recepción» y el filtro por tipo
  // mostraba dos opciones con el mismo texto.
  PURCHASE: "Compra",
  INITIAL_INTAKE: "Ingreso inicial",
  RESTOCK_RECEIVED: "Recepción",
  STORE_USE: "Uso interno",
  FESTIVAL_ALLOCATION: "Reserva de feria",
  FESTIVAL_RETURN: "Retorno de feria",
  IN_PERSON_SALE: "Venta presencial",
  VARIANT_CONVERSION: "Conversión a variantes",
};

export const MANUAL_ADJUSTMENT_OPTIONS: {
  value: MovementType;
  label: string;
}[] = [
  { value: "MANUAL_ADJUSTMENT", label: MOVEMENT_TYPE_LABELS.MANUAL_ADJUSTMENT },
  { value: "DAMAGE", label: MOVEMENT_TYPE_LABELS.DAMAGE },
  { value: "LOST", label: MOVEMENT_TYPE_LABELS.LOST },
  { value: "STORE_USE", label: MOVEMENT_TYPE_LABELS.STORE_USE },
  { value: "PROMOTION", label: MOVEMENT_TYPE_LABELS.PROMOTION },
  { value: "RETURN", label: MOVEMENT_TYPE_LABELS.RETURN },
  { value: "INITIAL_INTAKE", label: MOVEMENT_TYPE_LABELS.INITIAL_INTAKE },
];
