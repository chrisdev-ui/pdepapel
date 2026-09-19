import { Prisma, PrismaClient } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import { ATTRIBUTE_KIND_LABELS } from "@/lib/attribute-archive";
import { getCategoryRevalidationPaths, preserveCategorySlugAlias } from "@/lib/category-slugs";

/**
 * «Unir con…» (auditoría de Atributos, 2026-09-19).
 *
 * Un valor repetido (Rosa pastel / Rosado, Osito panda / Osito) no se podía
 * fusionar: solo archivar, y los productos seguían apuntando al viejo. Unir
 * pasa los productos de uno o más valores «fuente» a un valor «destino»,
 * comprueba antes la regla de colisión de los grupos (dos variantes del mismo
 * grupo no pueden quedar con la misma combinación de tamaño, color y diseño)
 * y deja las fuentes archivadas, no borradas, para poder deshacerlo. Los SKU
 * no cambian: son etiquetas ya impresas.
 */

export const MERGEABLE_KINDS = ["categories", "sizes", "colors", "designs"] as const;
export type MergeableKind = (typeof MERGEABLE_KINDS)[number];

export interface AttributeMergeInput {
  kind: MergeableKind;
  sourceIds: string[];
  targetId: string;
}

const isKind = (value: unknown): value is MergeableKind =>
  typeof value === "string" && (MERGEABLE_KINDS as readonly string[]).includes(value);

/** Valida el cuerpo de `POST /api/[storeId]/attributes/merge`. */
export function parseAttributeMergeBody(body: unknown): AttributeMergeInput & { dryRun: boolean } {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (!isKind(raw.kind)) {
    throw ErrorFactory.InvalidRequest("Solo se pueden unir subcategorías, tamaños, colores o diseños");
  }
  const targetId = typeof raw.targetId === "string" ? raw.targetId.trim() : "";
  if (!targetId) throw ErrorFactory.InvalidRequest("Elige el valor que se queda");
  const sourceIds = Array.isArray(raw.sourceIds)
    ? Array.from(new Set(raw.sourceIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id !== targetId)))
    : [];
  if (sourceIds.length === 0) throw ErrorFactory.InvalidRequest("Elige al menos un valor distinto del que se queda");
  if (sourceIds.length > 50) throw ErrorFactory.InvalidRequest("Une como máximo 50 valores a la vez");
  return { kind: raw.kind, sourceIds, targetId, dryRun: raw.dryRun === true };
}

type AttributeField = "categoryId" | "sizeId" | "colorId" | "designId";

export const MERGE_FIELD: Record<MergeableKind, AttributeField> = {
  categories: "categoryId",
  sizes: "sizeId",
  colors: "colorId",
  designs: "designId",
};

export interface VariantForCollision {
  id: string;
  name: string;
  productGroupId: string | null;
  sizeId: string;
  colorId: string;
  designId: string;
}

export interface VariantCollision {
  groupId: string;
  variants: { id: string; name: string }[];
}

/**
 * Grupos que quedarían con dos variantes activas de la misma combinación si
 * las fuentes pasaran al destino. Misma regla que `product-groups` al crear
 * o guardar un grupo; solo cuenta el tamaño, el color y el diseño.
 */
export function findVariantCollisions(
  variants: readonly VariantForCollision[],
  input: Pick<AttributeMergeInput, "kind" | "sourceIds" | "targetId">,
): VariantCollision[] {
  if (input.kind === "categories") return [];
  const field = MERGE_FIELD[input.kind];
  const sources = new Set(input.sourceIds);
  const byGroup = new Map<string, Map<string, { id: string; name: string }[]>>();
  for (const variant of variants) {
    if (!variant.productGroupId) continue;
    const resolved = { sizeId: variant.sizeId, colorId: variant.colorId, designId: variant.designId };
    if (sources.has(resolved[field as keyof typeof resolved])) resolved[field as keyof typeof resolved] = input.targetId;
    const key = `${resolved.sizeId}|${resolved.colorId}|${resolved.designId}`;
    const group = byGroup.get(variant.productGroupId) ?? new Map();
    group.set(key, [...(group.get(key) ?? []), { id: variant.id, name: variant.name }]);
    byGroup.set(variant.productGroupId, group);
  }
  const collisions: VariantCollision[] = [];
  byGroup.forEach((keys, groupId) => {
    keys.forEach((rows) => {
      if (rows.length > 1) collisions.push({ groupId, variants: [...rows].sort((a, b) => a.name.localeCompare(b.name, "es")) });
    });
  });
  return collisions;
}

type MergeClient = PrismaClient | Prisma.TransactionClient;

export interface AttributeMergePreview {
  kind: MergeableKind;
  target: { id: string; name: string; products: number };
  sources: { id: string; name: string; products: number }[];
  /** Productos que cambiarán de valor: activos y archivados. */
  products: { active: number; archived: number };
  /** Grupos con variantes que usan alguna fuente. */
  groups: number;
  collisions: (VariantCollision & { groupName: string })[];
  /** Solo subcategorías: ofertas y alias de URL que pasan al destino, y si cruza de categoría. */
  offers: number;
  aliases: number;
  crossType: boolean;
}

async function loadRows(db: MergeClient, kind: MergeableKind, storeId: string, ids: string[]) {
  const where = { storeId, id: { in: ids } };
  const select = { id: true, name: true, isArchived: true, _count: { select: { products: true } } };
  switch (kind) {
    case "categories":
      return db.category.findMany({ where, select: { ...select, typeId: true, slug: true } });
    case "sizes":
      return db.size.findMany({ where, select });
    case "colors":
      return db.color.findMany({ where, select });
    case "designs":
      return db.design.findMany({ where, select });
  }
}

type LoadedRow = Awaited<ReturnType<typeof loadRows>>[number] & { typeId?: string; slug?: string };

/** Qué pasaría al unir: conteos y colisiones, sin escribir nada. */
export async function previewAttributeMerge(
  db: MergeClient,
  params: { storeId: string; input: AttributeMergeInput },
): Promise<AttributeMergePreview> {
  const { storeId, input } = params;
  const label = ATTRIBUTE_KIND_LABELS[input.kind];
  const rows = (await loadRows(db, input.kind, storeId, [input.targetId, ...input.sourceIds])) as LoadedRow[];
  const target = rows.find((row) => row.id === input.targetId);
  if (!target) throw ErrorFactory.NotFound(`El ${label.singular} que se queda no existe en esta tienda`);
  if (target.isArchived) throw ErrorFactory.InvalidRequest(`«${target.name}» está archivado; restáuralo o elige otro destino`);
  const sources = input.sourceIds.map((id) => rows.find((row) => row.id === id)).filter((row): row is LoadedRow => Boolean(row));
  if (sources.length !== input.sourceIds.length) {
    throw ErrorFactory.NotFound(`Algunos ${label.plural} no existen en esta tienda`);
  }

  const field = MERGE_FIELD[input.kind];
  const [active, archived, affected] = await Promise.all([
    db.product.count({ where: { storeId, [field]: { in: input.sourceIds }, isArchived: false } }),
    db.product.count({ where: { storeId, [field]: { in: input.sourceIds }, isArchived: true } }),
    db.product.findMany({
      where: { storeId, [field]: { in: input.sourceIds }, productGroupId: { not: null } },
      select: { productGroupId: true },
      distinct: ["productGroupId"],
    }),
  ]);
  const groupIds = affected.map((row) => row.productGroupId).filter((id): id is string => Boolean(id));
  let collisions: AttributeMergePreview["collisions"] = [];
  if (groupIds.length > 0 && input.kind !== "categories") {
    const [variants, groups] = await Promise.all([
      db.product.findMany({
        where: { storeId, productGroupId: { in: groupIds }, isArchived: false },
        select: { id: true, name: true, productGroupId: true, sizeId: true, colorId: true, designId: true },
      }),
      db.productGroup.findMany({ where: { storeId, id: { in: groupIds } }, select: { id: true, name: true } }),
    ]);
    const names = new Map(groups.map((group) => [group.id, group.name]));
    collisions = findVariantCollisions(variants, input).map((collision) => ({ ...collision, groupName: names.get(collision.groupId) ?? "Grupo" }));
  }

  let offers = 0;
  let aliases = 0;
  let crossType = false;
  if (input.kind === "categories") {
    [offers, aliases] = await Promise.all([
      db.offerCategory.count({ where: { categoryId: { in: input.sourceIds } } }),
      db.categorySlugAlias.count({ where: { storeId, categoryId: { in: input.sourceIds } } }),
    ]);
    crossType = sources.some((source) => source.typeId !== target.typeId);
  }

  return {
    kind: input.kind,
    target: { id: target.id, name: target.name, products: target._count.products },
    sources: sources.map((source) => ({ id: source.id, name: source.name, products: source._count.products })),
    products: { active, archived },
    groups: groupIds.length,
    collisions,
    offers,
    aliases,
    crossType,
  };
}

export interface AttributeMergeResult {
  preview: AttributeMergePreview;
  moved: number;
  /** Slugs de subcategorías cuyas páginas cambian (fuentes y destino). */
  categorySlugs: string[];
}

/** Mensaje del 409 cuando la unión chocaría en algún grupo. */
export function collisionMessage(collisions: AttributeMergePreview["collisions"]): string {
  const first = collisions[0];
  const names = first.variants.map((variant) => `«${variant.name}»`).join(" y ");
  const more = collisions.length > 1 ? ` y ${collisions.length - 1} grupo${collisions.length > 2 ? "s" : ""} más` : "";
  return `En «${first.groupName}» quedarían dos variantes iguales (${names})${more}. Cambia el atributo de una de ellas y vuelve a intentar.`;
}

/**
 * Une los valores fuente en el destino dentro de una transacción ya abierta.
 * Se detiene con 409 si algún grupo quedaría con dos variantes iguales. Las
 * fuentes quedan archivadas; restaurarlas no deshace el movimiento de
 * productos, pero conserva el valor para volver a asignarlo.
 */
export async function mergeAttributes(
  db: MergeClient,
  params: { storeId: string; input: AttributeMergeInput; now?: Date },
): Promise<AttributeMergeResult> {
  const { storeId, input } = params;
  const now = params.now ?? new Date();
  const preview = await previewAttributeMerge(db, { storeId, input });
  if (preview.collisions.length > 0) {
    throw ErrorFactory.Conflict(collisionMessage(preview.collisions), { collisions: preview.collisions });
  }

  const field = MERGE_FIELD[input.kind];
  const moved = await db.product.updateMany({
    where: { storeId, [field]: { in: input.sourceIds } },
    data: { [field]: input.targetId },
  });

  const archive = { isArchived: true, archivedAt: now };
  const where = { storeId, id: { in: input.sourceIds } };
  let categorySlugs: string[] = [];

  switch (input.kind) {
    case "categories": {
      const [sources, target] = await Promise.all([
        db.category.findMany({ where, select: { id: true, slug: true } }),
        db.category.findFirst({ where: { storeId, id: input.targetId }, select: { slug: true } }),
      ]);
      // Ofertas y opciones para clientes pasan al destino sin repetir pares.
      const [offerRows, optionRows] = await Promise.all([
        db.offerCategory.findMany({ where: { categoryId: { in: input.sourceIds } }, select: { id: true, offerId: true } }),
        db.categoryCatalogOption.findMany({ where: { categoryId: { in: input.sourceIds } }, select: { id: true, optionId: true, displayOrder: true } }),
      ]);
      const existingOffers = new Set(
        (await db.offerCategory.findMany({ where: { categoryId: input.targetId }, select: { offerId: true } })).map((row) => row.offerId),
      );
      const existingOptions = new Set(
        (await db.categoryCatalogOption.findMany({ where: { categoryId: input.targetId }, select: { optionId: true } })).map((row) => row.optionId),
      );
      for (const row of offerRows) {
        if (existingOffers.has(row.offerId)) continue;
        existingOffers.add(row.offerId);
        await db.offerCategory.create({ data: { offerId: row.offerId, categoryId: input.targetId } });
      }
      for (const row of optionRows) {
        if (existingOptions.has(row.optionId)) continue;
        existingOptions.add(row.optionId);
        await db.categoryCatalogOption.create({ data: { storeId, categoryId: input.targetId, optionId: row.optionId, displayOrder: row.displayOrder } });
      }
      await db.offerCategory.deleteMany({ where: { categoryId: { in: input.sourceIds } } });
      await db.categoryCatalogOption.deleteMany({ where: { categoryId: { in: input.sourceIds } } });
      // Las URL viejas siguen abriendo: los alias pasan al destino y cada slug fuente queda como alias.
      await db.categorySlugAlias.updateMany({ where: { storeId, categoryId: { in: input.sourceIds } }, data: { categoryId: input.targetId } });
      await db.category.updateMany({ where, data: archive });
      for (const source of sources) {
        // La fuente conserva su slug (archivada), así que el alias solo se crea si nadie más lo usa;
        // el lector público resuelve primero la subcategoría activa y después el alias.
        await preserveCategorySlugAlias(db, { storeId, categoryId: input.targetId, slug: source.slug });
      }
      categorySlugs = [...sources.map((source) => source.slug), target?.slug ?? ""].filter(Boolean);
      break;
    }
    case "sizes":
      await db.size.updateMany({ where, data: archive });
      break;
    case "colors":
      await db.color.updateMany({ where, data: archive });
      break;
    case "designs":
      await db.design.updateMany({ where, data: archive });
      break;
  }

  return { preview, moved: moved.count, categorySlugs };
}

/** Rutas de la tienda que cambian al unir atributos. */
export function attributeMergeRevalidationPaths(categorySlugs: string[]): string[] {
  return getCategoryRevalidationPaths(...categorySlugs);
}

export function attributeMergeMessage(preview: AttributeMergePreview, moved: number): string {
  const label = ATTRIBUTE_KIND_LABELS[preview.kind];
  const sources = preview.sources.map((source) => `«${source.name}»`).join(", ");
  const noun = preview.sources.length === 1 ? label.singular : label.plural;
  return `${moved} ${moved === 1 ? "producto pasó" : "productos pasaron"} a «${preview.target.name}»; ${noun} ${sources} ${preview.sources.length === 1 ? "queda archivado" : "quedan archivados"}.`;
}

// ─── Mover subcategorías a otra categoría ───────────────────────────────────

export interface MoveCategoriesInput {
  ids: string[];
  typeId: string;
}

export function parseMoveCategoriesBody(body: unknown): MoveCategoriesInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  const typeId = typeof raw.typeId === "string" ? raw.typeId.trim() : "";
  if (!typeId) throw ErrorFactory.InvalidRequest("Elige la categoría de destino");
  const ids = Array.isArray(raw.ids) ? Array.from(new Set(raw.ids.filter((id): id is string => typeof id === "string" && id.length > 0))) : [];
  if (ids.length === 0) throw ErrorFactory.InvalidRequest("Selecciona al menos una subcategoría");
  if (ids.length > 200) throw ErrorFactory.InvalidRequest("Mueve como máximo 200 subcategorías a la vez");
  return { ids, typeId };
}

/** Cambia la categoría padre de varias subcategorías; la URL de cada una no cambia. */
export async function moveCategoriesToType(
  db: MergeClient,
  params: { storeId: string; input: MoveCategoriesInput },
): Promise<{ count: number; categorySlugs: string[]; typeName: string }> {
  const { storeId, input } = params;
  const type = await db.type.findFirst({ where: { storeId, id: input.typeId }, select: { name: true, isArchived: true } });
  if (!type) throw ErrorFactory.NotFound("La categoría de destino no existe en esta tienda");
  if (type.isArchived) throw ErrorFactory.InvalidRequest(`«${type.name}» está archivada; restáurala o elige otra`);
  const rows = await db.category.findMany({ where: { storeId, id: { in: input.ids } }, select: { id: true, slug: true } });
  if (rows.length !== input.ids.length) throw ErrorFactory.NotFound("Algunas subcategorías no existen en esta tienda");
  const result = await db.category.updateMany({ where: { storeId, id: { in: input.ids } }, data: { typeId: input.typeId } });
  return { count: result.count, categorySlugs: rows.map((row) => row.slug).filter(Boolean), typeName: type.name };
}
