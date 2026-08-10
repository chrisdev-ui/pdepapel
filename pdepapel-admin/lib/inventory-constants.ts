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
  | "IN_PERSON_SALE";

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  ORDER_PLACED: "Venta",
  ORDER_CANCELLED: "Cancelación",
  MANUAL_ADJUSTMENT: "Ajuste Manual (+/-)",
  INITIAL_MIGRATION: "Migración",
  RETURN: "Devolución (+)",
  DAMAGE: "Daño (-)",
  LOST: "Pérdida (-)",
  PROMOTION: "Promoción (-)",
  PURCHASE: "Compra",
  INITIAL_INTAKE: "Ingreso Inicial (+)",
  RESTOCK_RECEIVED: "Reabastecimiento",
  STORE_USE: "Uso Interno (-)",
  FESTIVAL_ALLOCATION: "Asignación a feria (-)",
  FESTIVAL_RETURN: "Devolución de feria (+)",
  IN_PERSON_SALE: "Venta presencial (-)",
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
