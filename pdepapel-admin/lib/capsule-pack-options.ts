import { CapsuleEditionStatus } from "@prisma/client";

import { AppError, ErrorFactory } from "@/lib/api-errors";
import { checkPoolMargins, type PoolLine } from "@/lib/capsule-pool";
import { CAPSULE_PACK_PRICES, capsuleUnitPrice, type CapsulePackCosts } from "@/lib/pricing/capsules";
import prismadb from "@/lib/prismadb";

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

/**
 * Guarda los packs de una edición solo si cada pack que cabe en la bolsa
 * (impresa + propuesta) deja su P95 en el margen mínimo de la tienda o más.
 * En la misma transacción escribe la escalera de precio del producto de la
 * edición (`ProductPriceTier`, un peldaño por pack mayor al mínimo); el
 * precio base del producto no se toca.
 */
export async function savePackOptions({ storeId, editionId, options: raw, proposed = [] }: { storeId: string; editionId: string; options: unknown; proposed?: PoolLine[] }) {
  const options = parsePackOptions(raw);
  const edition = await prismadb.capsuleEdition.findFirst({ where: { id: editionId, storeId }, select: { id: true, status: true, productId: true } });
  if (!edition) throw ErrorFactory.NotFound("Edición no encontrada");
  if (edition.status === CapsuleEditionStatus.LIVE || edition.status === CapsuleEditionStatus.CLOSED) {
    throw ErrorFactory.Conflict("Los packs solo se cambian mientras la edición no está a la venta");
  }
  const check = await checkPoolMargins({ storeId, editionId, proposed, packOptions: options });
  if (check.poolSize === 0) throw ErrorFactory.InvalidRequest("Elige la bolsa de papeles antes de guardar los packs: el margen se mide sobre ella");
  if (check.minMarginPct === null) throw ErrorFactory.InvalidRequest("Pon el margen mínimo de la edición (o el de la tienda en Configuración): es el piso del P95 de cada pack");
  if (!check.ok) {
    const failing = check.packs.filter((pack) => pack.passes === false).map((pack) => `${pack.packSize} (P95 ${pack.p95Pct} %)`);
    throw new AppError(`Con esta bolsa no llegan al margen mínimo de ${check.minMarginPct} %: ${failing.length === 1 ? "el pack de" : "los packs de"} ${failing.join(", ")}`, 409, { check });
  }

  const [smallest] = [...CAPSULE_PACK_PRICES].sort((a, b) => a.packSize - b.packSize);
  const tiers = CAPSULE_PACK_PRICES.filter((price) => price.packSize > smallest.packSize).map((price) => ({ minQuantity: price.packSize, unitPrice: capsuleUnitPrice(price) }));
  await prismadb.$transaction(async (tx) => {
    await tx.capsulePackOption.deleteMany({ where: { editionId } });
    await tx.capsulePackOption.createMany({ data: options.map((option) => ({ editionId, ...option })) });
    await tx.productPriceTier.deleteMany({ where: { productId: edition.productId, minQuantity: { notIn: tiers.map((tier) => tier.minQuantity) } } });
    for (const tier of tiers) {
      await tx.productPriceTier.upsert({
        where: { productId_minQuantity: { productId: edition.productId, minQuantity: tier.minQuantity } },
        update: { unitPrice: tier.unitPrice },
        create: { storeId, productId: edition.productId, ...tier },
      });
    }
  });
  return { options, check };
}
