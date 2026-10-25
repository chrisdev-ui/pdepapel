/**
 * Lo de Configuración › Datos del negocio que también usa el formulario del
 * navegador. Aparte de `lib/store-settings.ts`, que consulta la base: así el
 * formulario no arrastra Prisma al cliente.
 */
export const WEEK_DAYS = [
  "lun",
  "mar",
  "mie",
  "jue",
  "vie",
  "sab",
  "dom",
] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export const DAY_LABELS: Record<WeekDay, string> = {
  lun: "Lunes",
  mar: "Martes",
  mie: "Miércoles",
  jue: "Jueves",
  vie: "Viernes",
  sab: "Sábado",
  dom: "Domingo",
};

/**
 * Solo rellena el formulario cuando el campo está vacío. Se cuenta desde que
 * se confirma el pago y coincide con Merchant Center: 0–1 día de preparación
 * y 2–5 de tránsito, 2 a 6 días hábiles (ola 3, fase 2A, 2026-10-06).
 */
export const DEFAULT_DELIVERY_ESTIMATE = "2 a 6 días hábiles";
