import { ErrorFactory } from "@/lib/api-errors";
import { parsePackOptions, type PackOptionInput } from "@/lib/capsule-pack-options";
import { pickCapsuleFloor } from "@/lib/capsule-suggestions";
import { CAPSULE_PACK_PRICES } from "@/lib/pricing/capsules";
import prismadb from "@/lib/prismadb";

/**
 * Ajustes de cápsulas de la tienda: el piso de costo de un papel en las
 * sugerencias y la plantilla de packs (regalo y caja). Las sugerencias usan
 * los packs de la edición más reciente que los tenga; la plantilla solo
 * cuando no hay ninguna. Ninguna cifra vive en el código.
 */
export interface PackTemplateSource {
  source: "edition" | "template";
  /** La edición de donde salen los packs, si es esa la fuente. */
  edition: { id: string; number: number; name: string } | null;
  options: PackOptionInput[];
}

export async function resolveSuggestionPackOptions(storeId: string): Promise<PackTemplateSource | null> {
  const edition = await prismadb.capsuleEdition.findFirst({
    where: { storeId, packOptions: { some: {} } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, number: true, name: true, packOptions: { select: { packSize: true, giftMaxCost: true, giftMaxItems: true, giftLabel: true, boxReserveCost: true } } },
  });
  if (edition && edition.packOptions.length === CAPSULE_PACK_PRICES.length) {
    return { source: "edition", edition: { id: edition.id, number: edition.number, name: edition.name }, options: edition.packOptions.sort((a, b) => a.packSize - b.packSize) };
  }
  const template = await prismadb.capsulePackTemplate.findMany({
    where: { storeId },
    select: { packSize: true, giftMaxCost: true, giftMaxItems: true, giftLabel: true, boxReserveCost: true },
    orderBy: { packSize: "asc" },
  });
  return template.length === CAPSULE_PACK_PRICES.length ? { source: "template", edition: null, options: template } : null;
}

/**
 * El piso de margen de las cápsulas. Para sugerir una edición nueva: el de la
 * edición más reciente si lo tiene, luego el de cápsulas, luego el de la
 * tienda. En el taller se pasa la edición que se arma: su piso, aunque sea null, reemplaza al de la más reciente.
 */
export async function resolveCapsuleFloor(storeId: string, edition?: { minMarginPct: number | null }) {
  const [store, latest] = await Promise.all([
    prismadb.store.findUnique({ where: { id: storeId }, select: { capsuleMinMarginPct: true, storeMinMarginPercent: true } }),
    edition ? Promise.resolve(null) : prismadb.capsuleEdition.findFirst({ where: { storeId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { number: true, name: true, minMarginPct: true } }),
  ]);
  const floor = pickCapsuleFloor({
    editionFloor: edition ? edition.minMarginPct : latest?.minMarginPct,
    capsuleFloor: store?.capsuleMinMarginPct,
    storeFloor: store?.storeMinMarginPercent,
  });
  return floor ? { ...floor, edition: floor.source === "edition" && latest ? { number: latest.number, name: latest.name } : null } : null;
}

export async function getCapsuleSettings(storeId: string) {
  const [store, template, active] = await Promise.all([
    prismadb.store.findUnique({ where: { id: storeId }, select: { capsuleMinSlipCost: true, capsuleMinMarginPct: true } }),
    prismadb.capsulePackTemplate.findMany({ where: { storeId }, orderBy: { packSize: "asc" }, select: { packSize: true, giftMaxCost: true, giftMaxItems: true, giftLabel: true, boxReserveCost: true } }),
    resolveSuggestionPackOptions(storeId),
  ]);
  return {
    minSlipCost: store?.capsuleMinSlipCost ?? null,
    minMarginPct: store?.capsuleMinMarginPct ?? null,
    template,
    activeSource: active ? { source: active.source, edition: active.edition } : null,
  };
}

function parseMinSlipCost(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) throw ErrorFactory.InvalidRequest("El costo mínimo de un papel debe ser un valor en pesos de 0 en adelante, o vacío");
  return Math.round(amount);
}

function parseMinMarginPct(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const pct = Number(value);
  if (!Number.isFinite(pct) || pct < 0 || pct > 90) throw ErrorFactory.InvalidRequest("El margen mínimo de cápsulas va de 0 a 90 %, o vacío");
  return Math.round(pct * 10) / 10;
}

/** Guarda el piso de costo, el margen de cápsulas y, si viene, la plantilla completa (todos los packs). */
export async function saveCapsuleSettings(storeId: string, body: unknown) {
  const raw = (body ?? {}) as Record<string, unknown>;
  const minSlipCost = parseMinSlipCost(raw.minSlipCost);
  const minMarginPct = parseMinMarginPct(raw.minMarginPct);
  const template = raw.template === undefined || raw.template === null ? null : parsePackOptions(raw.template);
  await prismadb.$transaction(async (tx) => {
    await tx.store.update({ where: { id: storeId }, data: { capsuleMinSlipCost: minSlipCost, capsuleMinMarginPct: minMarginPct } });
    if (template) {
      for (const option of template) {
        await tx.capsulePackTemplate.upsert({
          where: { storeId_packSize: { storeId, packSize: option.packSize } },
          update: { giftMaxCost: option.giftMaxCost, giftMaxItems: option.giftMaxItems, giftLabel: option.giftLabel, boxReserveCost: option.boxReserveCost },
          create: { storeId, ...option },
        });
      }
    }
  });
  return getCapsuleSettings(storeId);
}
