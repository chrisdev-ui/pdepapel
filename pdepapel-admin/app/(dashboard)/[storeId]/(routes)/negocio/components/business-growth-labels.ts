import type { BusinessCashMovementType } from "@/lib/business-growth";

/** Etiquetas compartidas entre `client.tsx` y las tres vistas de adentro. */
export const MOVEMENT_LABELS: Record<BusinessCashMovementType, string> = {
  OPERATING_EXPENSE: "Gasto operativo",
  MARKETING_SPEND: "Inversión en marketing",
  TAX_PAYMENT: "Pago de impuestos",
  INVENTORY_PURCHASE: "Compra o reposición de inventario",
  OWNER_DRAW: "Retiro personal",
  OWNER_CONTRIBUTION: "Aporte personal al negocio",
  OTHER_INFLOW: "Otro ingreso",
  OTHER_OUTFLOW: "Otro egreso",
};

export const MOVEMENT_OPTIONS = Object.entries(MOVEMENT_LABELS) as Array<
  [BusinessCashMovementType, string]
>;

export const CAMPAIGN_STATE = {
  READY_TO_TEST: { label: "Lista para prueba", variant: "success" as const },
  ORGANIC_FIRST: { label: "Primero orgánico", variant: "info" as const },
  HOLD: { label: "No promocionar aún", variant: "warning" as const },
};

export const CAMPAIGN_STATUS = {
  DRAFT: "Borrador",
  READY: "Lista para revisar",
  ACTIVE: "Activa externamente",
  PAUSED: "Pausada",
  COMPLETED: "Finalizada",
  ARCHIVED: "Archivada",
};

/** «Septiembre de 2026» a partir de «septiembre de 2026». */
export function formatMonth(value: string) {
  return value.replace(/^./, (letter) => letter.toUpperCase());
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

/** «a, b y c» — para enumerar en español sin que suene a lista de sistema. */
export function joinEs(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}
