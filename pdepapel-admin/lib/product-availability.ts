import type { Prisma } from "@prisma/client";

// «Próximamente»: un producto con availableAt en el futuro se muestra en la
// tienda sin botón de compra hasta esa fecha (hora de Bogotá).

export type ProductAvailability = "available" | "coming-soon" | "all";

export const PRODUCT_AVAILABILITY_PARAM = "availability";

const BOGOTA_OFFSET = "-05:00";
const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;

export function parseProductAvailability(value: string | null | undefined): ProductAvailability {
  return value === "coming-soon" || value === "all" ? value : "available";
}

export function isComingSoon(product: { availableAt?: Date | string | null }, now: Date = new Date()): boolean {
  if (!product.availableAt) return false;
  return new Date(product.availableAt).getTime() > now.getTime();
}

export function productAvailabilityWhere(availability: ProductAvailability, now: Date = new Date()): Prisma.ProductWhereInput {
  if (availability === "coming-soon") return { availableAt: { gt: now } };
  if (availability === "all") return {};
  return { OR: [{ availableAt: null }, { availableAt: { lte: now } }] };
}

/** Acepta `yyyy-MM-dd` (medianoche en Bogotá), una fecha ISO, `null` o vacío. */
export function parseAvailableAt(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") throw new Error("La fecha de disponibilidad no es válida");
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = DATE_INPUT.test(trimmed) ? new Date(`${trimmed}T00:00:00.000${BOGOTA_OFFSET}`) : new Date(trimmed);
  if (Number.isNaN(date.getTime())) throw new Error("La fecha de disponibilidad no es válida");
  return date;
}

export function availableAtToInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function formatAvailableAt(value: Date | string): string {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "America/Bogota" }).format(new Date(value));
}
