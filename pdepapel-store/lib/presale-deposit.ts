import type { Product } from "@/types";

type Presale = NonNullable<Product["presales"]>[number];

/** Copia de `PRESALE_MAX_PER_ORDER` del panel (lib/presale.ts): el freno de una campaña sin tope. */
export const PRESALE_MAX_PER_ORDER = 5;

/**
 * Anticipo de UNA unidad, en pesos enteros. Copia de pdepapel-admin/lib/presale-deposit.ts:
 * fijo, el valor sin pasar del precio; porcentaje, redondeado al peso. Sin tipo
 * o sin valor, la unidad se paga completa.
 */
export function presaleUnitDeposit(
  presale: Pick<Presale, "depositType" | "depositValue">,
  unitPrice: number,
): number {
  const price = Math.max(0, Math.round(unitPrice));
  const value = Number(presale.depositValue ?? 0);
  if (!presale.depositType || !Number.isFinite(value) || value <= 0) return price;
  if (presale.depositType === "PERCENT") return Math.min(price, Math.round((price * value) / 100));
  return Math.min(price, Math.round(value));
}

export function isDepositPresale(presale: Pick<Presale, "paymentMode"> | null | undefined): boolean {
  return presale?.paymentMode === "DEPOSIT";
}

/** La línea es una preventa que hoy cobra solo el anticipo: se compra sola. */
export function isDepositPresaleItem(product: Pick<Product, "presales"> | null | undefined): boolean {
  return isDepositPresale(product?.presales?.[0]);
}

/** «5 de diciembre», como lo escriben el panel y el bot. */
export function formatPresaleArrivalDate(value: string | Date): string {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "America/Bogota" }).format(new Date(value));
}

/** «Fecha estimada: 5 de diciembre» / «… primera semana de diciembre» / «… por confirmar». */
export function describePresaleArrival(presale: Pick<Presale, "expectedArrivalAt" | "expectedArrivalText">): string {
  if (presale.expectedArrivalAt) return `Fecha estimada: ${formatPresaleArrivalDate(presale.expectedArrivalAt)}`;
  const text = presale.expectedArrivalText?.trim();
  return `Fecha estimada: ${text || "por confirmar"}`;
}
