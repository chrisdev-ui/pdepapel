import { ErrorFactory } from "@/lib/api-errors";
import { parsePackOptions, type PackOptionInput } from "@/lib/capsule-pack-options";
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
  // Completa solo con todos los packs: la plantilla se guarda entera y cada caja trae costo o «Sin caja».
  return template.length === CAPSULE_PACK_PRICES.length ? { source: "template", edition: null, options: template } : null;
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
    // Una fila guardada con caja en 0 solo pudo llegar marcada «Sin caja» (parsePackOptions con explicitBox).
    template: template.map((row) => ({ ...row, noBox: row.boxReserveCost === 0 })),
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

/**
 * Guarda el piso de costo, el margen de cápsulas y, si viene, la plantilla
 * completa (todos los packs). Un campo que no viene se deja como está; solo
 * `null` o vacío lo borra.
 */
export async function saveCapsuleSettings(storeId: string, body: Record<string, unknown>) {
  const data: { capsuleMinSlipCost?: number | null; capsuleMinMarginPct?: number | null } = {};
  if (body.minSlipCost !== undefined) data.capsuleMinSlipCost = parseMinSlipCost(body.minSlipCost);
  if (body.minMarginPct !== undefined) data.capsuleMinMarginPct = parseMinMarginPct(body.minMarginPct);
  const template = body.template === undefined || body.template === null ? null : parsePackOptions(body.template, { explicitBox: true });
  await prismadb.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) await tx.store.update({ where: { id: storeId }, data });
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
