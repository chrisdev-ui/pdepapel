import type { Prisma } from "@prisma/client";

import { GROUP_ONLY_SCOPE, groupCoverPhoto } from "@/lib/variant-images";

/**
 * Plan del respaldo «portada solo del grupo» (sin Prisma: se prueba con datos
 * armados y lo ejecuta `scripts/backfill-group-main-only.ts`).
 *
 * - Cada foto principal de un grupo queda con alcance GROUP_ONLY.
 * - Una variante que conserva al menos otra foto (propia o repartida) pierde
 *   sus filas con la imagen de la portada, copias o propias. Si su portada
 *   era una de esas, pasa a la primera propia que quede; sin propias, a la
 *   primera foto repartida.
 * - Una variante cuyas fotos son todas la portada no se toca: la sigue
 *   mostrando de respaldo y sale en la lista para que Paula le suba una.
 * - Un grupo con varias fotos principales (datos viejos: el formulario muestra
 *   una sola estrella) no se toca: sale en `multiCoverGroups` hasta decidir
 *   cuál es su portada.
 *
 * Es la única excepción deliberada a «el reparto no borra filas propias».
 */

export interface BackfillImageRow {
  id: string;
  url: string;
  isMain: boolean;
  origin: "OWN" | "GROUP_COPY" | null;
  createdAt: Date;
  updatedAt: Date;
  brokenAt: Date | null;
}

export interface BackfillVariant {
  id: string;
  name: string;
  sku: string | null;
  isArchived: boolean;
  images: BackfillImageRow[];
}

export interface BackfillGroup {
  id: string;
  name: string;
  images: { id: string; url: string; isMain: boolean; scope: string | null }[];
  products: BackfillVariant[];
}

export interface BackfillPlan {
  scopeUpdates: { imageId: string; groupId: string; before: string | null }[];
  deletions: (BackfillImageRow & { productId: string })[];
  coverChanges: { imageId: string; productId: string; url: string }[];
  /** Variantes tocadas: para revalidar la tienda después. */
  touchedProductIds: string[];
  /** Solo muestran la portada: se quedan con ella de respaldo. */
  skipped: { groupId: string; group: string; productId: string; variant: string; sku: string | null; isArchived: boolean }[];
  /** Varias fotos principales: no se tocan; filas de variante con esas fotos. */
  multiCoverGroups: { groupId: string; group: string; covers: number; withScope: number; variantRows: number }[];
}

/** Lo que el guion lee de cada grupo (el mismo `select` lo usa su prueba). */
export const BACKFILL_GROUP_SELECT = {
  id: true,
  name: true,
  images: { select: { id: true, url: true, isMain: true, scope: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  products: {
    select: {
      id: true,
      name: true,
      sku: true,
      isArchived: true,
      images: { select: { id: true, url: true, isMain: true, origin: true, createdAt: true, updatedAt: true, brokenAt: true } },
    },
  },
} satisfies Prisma.ProductGroupSelect;

const byGalleryOrder = (a: BackfillImageRow, b: BackfillImageRow) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

export function planGroupCoverBackfill(groups: BackfillGroup[]): BackfillPlan {
  const plan: BackfillPlan = { scopeUpdates: [], deletions: [], coverChanges: [], touchedProductIds: [], skipped: [], multiCoverGroups: [] };
  for (const group of groups) {
    const covers = group.images.filter((image) => image.isMain);
    if (covers.length === 0) continue;
    if (covers.length > 1) {
      const urls = new Set(covers.map((cover) => cover.url.trim()));
      const variantRows = group.products.reduce((sum, variant) => sum + variant.images.filter((row) => urls.has(row.url.trim())).length, 0);
      plan.multiCoverGroups.push({ groupId: group.id, group: group.name, covers: covers.length, withScope: covers.filter((cover) => cover.scope !== null).length, variantRows });
      continue;
    }
    for (const cover of covers) {
      if (cover.scope !== GROUP_ONLY_SCOPE) plan.scopeUpdates.push({ imageId: cover.id, groupId: group.id, before: cover.scope });
    }
    const coverUrls = new Set(covers.map((cover) => cover.url.trim()));

    for (const variant of group.products) {
      const coverRows = variant.images.filter((row) => coverUrls.has(row.url.trim()));
      if (coverRows.length === 0) continue;
      const others = variant.images.filter((row) => !coverUrls.has(row.url.trim())).sort(byGalleryOrder);
      if (others.length === 0) {
        plan.skipped.push({ groupId: group.id, group: group.name, productId: variant.id, variant: variant.name, sku: variant.sku, isArchived: variant.isArchived });
        continue;
      }
      plan.deletions.push(...coverRows.map((row) => ({ ...row, productId: variant.id })));
      plan.touchedProductIds.push(variant.id);
      if (!others.some((row) => row.isMain)) {
        const next = others.find((row) => row.origin !== "GROUP_COPY") ?? others[0];
        plan.coverChanges.push({ imageId: next.id, productId: variant.id, url: next.url });
      }
    }
  }
  return plan;
}

const sqlString = (value: string) => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
const sqlDate = (value: Date) => `'${value.toISOString().replace("T", " ").replace("Z", "")}'`;

/** Las líneas que devuelven todo a como estaba (filas borradas, portadas y alcances). */
export function undoStatements(plan: BackfillPlan): string[] {
  return [
    ...plan.deletions.map(
      (row) =>
        `INSERT INTO \`Image\` (\`id\`, \`productId\`, \`url\`, \`isMain\`, \`origin\`, \`brokenAt\`, \`createdAt\`, \`updatedAt\`) VALUES (${sqlString(row.id)}, ${sqlString(row.productId)}, ${sqlString(row.url)}, ${row.isMain ? 1 : 0}, ${row.origin ? sqlString(row.origin) : "NULL"}, ${row.brokenAt ? sqlDate(row.brokenAt) : "NULL"}, ${sqlDate(row.createdAt)}, ${sqlDate(row.updatedAt)});`,
    ),
    ...plan.coverChanges.map((change) => `UPDATE \`Image\` SET \`isMain\` = 0 WHERE \`id\` = ${sqlString(change.imageId)};`),
    ...plan.scopeUpdates.map((update) => `UPDATE \`Image\` SET \`scope\` = ${update.before === null ? "NULL" : sqlString(update.before)} WHERE \`id\` = ${sqlString(update.imageId)};`),
  ];
}

interface ImageWriter {
  image: {
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
}

/** Escribe el plan dentro de la transacción que recibe; devuelve las filas tocadas. */
export async function applyGroupCoverBackfill(tx: ImageWriter, plan: BackfillPlan): Promise<number> {
  let rows = 0;
  const scopeIds = plan.scopeUpdates.map((update) => update.imageId);
  if (scopeIds.length) rows += (await tx.image.updateMany({ where: { id: { in: scopeIds }, isMain: true }, data: { scope: GROUP_ONLY_SCOPE } })).count;
  const deleteIds = plan.deletions.map((row) => row.id);
  if (deleteIds.length) rows += (await tx.image.deleteMany({ where: { id: { in: deleteIds } } })).count;
  const coverIds = plan.coverChanges.map((change) => change.imageId);
  if (coverIds.length) rows += (await tx.image.updateMany({ where: { id: { in: coverIds }, isMain: false }, data: { isMain: true } })).count;
  return rows;
}

/**
 * Grupos viejos con varias fotos principales: se queda con la estrella solo
 * la que el formulario muestra como portada (`groupCoverPhoto`, en el orden de
 * `BACKFILL_GROUP_SELECT`); las demás pasan a `isMain = 0` con su alcance
 * guardado, así cada variante conserva su foto de color. Las que no tienen
 * alcance salen en `unscoped`: Paula les elige destino al guardar el grupo.
 */
export interface DemotionPlan {
  demotions: { imageId: string; groupId: string; url: string; scope: string | null }[];
  groups: { groupId: string; group: string; coverImageId: string; coverUrl: string; demoted: number; unscoped: { imageId: string; url: string }[] }[];
}

export function planExtraCoverDemotion(groups: BackfillGroup[]): DemotionPlan {
  const plan: DemotionPlan = { demotions: [], groups: [] };
  for (const group of groups) {
    if (group.images.filter((image) => image.isMain).length < 2) continue;
    const cover = groupCoverPhoto(group.images.filter((image) => image.isMain));
    if (!cover) continue;
    const extras = group.images.filter((image) => image.isMain && image.id !== cover.id);
    plan.demotions.push(...extras.map((image) => ({ imageId: image.id, groupId: group.id, url: image.url, scope: image.scope })));
    plan.groups.push({
      groupId: group.id,
      group: group.name,
      coverImageId: cover.id,
      coverUrl: cover.url,
      demoted: extras.length,
      unscoped: extras.filter((image) => image.scope === null).map((image) => ({ imageId: image.id, url: image.url })),
    });
  }
  return plan;
}

export function demotionUndoStatements(plan: DemotionPlan): string[] {
  return plan.demotions.map((row) => `UPDATE \`Image\` SET \`isMain\` = 1 WHERE \`id\` = ${sqlString(row.imageId)};`);
}

/** Cómo quedan los grupos después de bajar las estrellas sobrantes (para el ensayo del respaldo principal). */
export function withDemotedCovers(groups: BackfillGroup[], plan: DemotionPlan): BackfillGroup[] {
  const demoted = new Set(plan.demotions.map((row) => row.imageId));
  return groups.map((group) => ({ ...group, images: group.images.map((image) => (demoted.has(image.id) ? { ...image, isMain: false } : image)) }));
}

export async function applyExtraCoverDemotion(tx: ImageWriter, plan: DemotionPlan): Promise<number> {
  const ids = plan.demotions.map((row) => row.imageId);
  if (ids.length === 0) return 0;
  return (await tx.image.updateMany({ where: { id: { in: ids }, isMain: true, productGroupId: { not: null } }, data: { isMain: false } })).count;
}
