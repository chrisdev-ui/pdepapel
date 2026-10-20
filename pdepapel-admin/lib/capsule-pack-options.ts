import { ErrorFactory } from "@/lib/api-errors";
import { CAPSULE_PACK_PRICES, type CapsulePackCosts } from "@/lib/pricing/capsules";

export interface PackOptionInput extends CapsulePackCosts {
  giftLabel: string | null;
}

const money = (value: unknown, label: string) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw ErrorFactory.InvalidRequest(`${label} debe ser un valor de 0 en adelante`);
  return Math.round(amount);
};

/** Una fila por cada pack de la escalera, con su regalo y su caja. */
export function parsePackOptions(value: unknown): PackOptionInput[] {
  if (!Array.isArray(value)) throw ErrorFactory.InvalidRequest("Faltan los packs");
  const sizes = new Set(CAPSULE_PACK_PRICES.map((price) => price.packSize));
  const seen = new Set<number>();
  const options = value.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const packSize = Number(row.packSize);
    if (!sizes.has(packSize)) throw ErrorFactory.InvalidRequest(`No hay pack de ${row.packSize}`);
    if (seen.has(packSize)) throw ErrorFactory.InvalidRequest(`El pack de ${packSize} aparece dos veces`);
    seen.add(packSize);
    const giftMaxItems = Number(row.giftMaxItems ?? 0);
    if (!Number.isInteger(giftMaxItems) || giftMaxItems < 0 || giftMaxItems > 5) throw ErrorFactory.InvalidRequest("Los regalos por pack van de 0 a 5");
    const giftMaxCost = money(row.giftMaxCost ?? 0, `El tope del regalo del pack de ${packSize}`);
    if ((giftMaxItems === 0) !== (giftMaxCost === 0)) {
      throw ErrorFactory.InvalidRequest(`El pack de ${packSize}: un regalo necesita tope y cantidad, o ninguno de los dos`);
    }
    const label = typeof row.giftLabel === "string" ? row.giftLabel.trim().slice(0, 120) : "";
    return { packSize, giftMaxCost, giftMaxItems, boxReserveCost: money(row.boxReserveCost ?? 0, `La caja del pack de ${packSize}`), giftLabel: label || null };
  });
  const missing = Array.from(sizes).filter((size) => !seen.has(size));
  if (missing.length) throw ErrorFactory.InvalidRequest(`Falta configurar ${missing.length === 1 ? "el pack" : "los packs"} de ${missing.join(", ")}`);
  return options.sort((a, b) => a.packSize - b.packSize);
}
