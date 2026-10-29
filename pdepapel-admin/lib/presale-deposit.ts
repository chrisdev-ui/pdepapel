import type { PresaleDepositType } from "@prisma/client";

/**
 * Anticipo de UNA unidad, en pesos enteros. Fijo: el valor, sin pasar del
 * precio. Porcentaje: redondeado al peso. El checkout lo multiplica por las
 * unidades y lo copia en el pedido.
 */
export function presaleUnitDeposit(
  presale: { depositType: PresaleDepositType | "FIXED" | "PERCENT" | null; depositValue: number | null },
  unitPrice: number,
): number {
  const price = Math.max(0, Math.round(unitPrice));
  const value = Number(presale.depositValue ?? 0);
  if (!presale.depositType || !Number.isFinite(value) || value <= 0) return price;
  if (presale.depositType === "PERCENT") return Math.min(price, Math.round((price * value) / 100));
  return Math.min(price, Math.round(value));
}
