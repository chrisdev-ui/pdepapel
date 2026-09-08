import { Prisma, PrismaClient } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";

/**
 * Archivar atributos del catálogo (rediseño del panel, 2026-09).
 *
 * Archivar retira un atributo de los formularios y de la tienda en línea sin
 * tocar los productos que lo usan ni el historial de pedidos, igual que
 * `Product.isArchived`. Eliminar queda solo para atributos sin productos.
 */

export const ATTRIBUTE_KINDS = ["types", "categories", "sizes", "colors", "designs"] as const;
export type AttributeKind = (typeof ATTRIBUTE_KINDS)[number];

export const ATTRIBUTE_KIND_LABELS: Record<AttributeKind, { singular: string; plural: string }> = {
  types: { singular: "categoría", plural: "categorías" },
  categories: { singular: "subcategoría", plural: "subcategorías" },
  sizes: { singular: "tamaño", plural: "tamaños" },
  colors: { singular: "color", plural: "colores" },
  designs: { singular: "diseño", plural: "diseños" },
};

/** Filtro para lectores públicos y formularios: solo atributos activos. */
export const ACTIVE_ATTRIBUTE_WHERE = { isArchived: false } as const;

/**
 * `where` para un formulario de edición: atributos activos más el que el
 * registro ya tiene, aunque esté archivado, para no romper la edición.
 */
export function activeOrCurrentWhere(
  currentId: string | null | undefined,
): { isArchived: boolean } | { OR: Array<{ isArchived: boolean } | { id: string }> } {
  return currentId ? { OR: [ACTIVE_ATTRIBUTE_WHERE, { id: currentId }] } : ACTIVE_ATTRIBUTE_WHERE;
}

export interface AttributeArchiveInput {
  kind: AttributeKind;
  ids: string[];
  archived: boolean;
}

const isKind = (value: unknown): value is AttributeKind =>
  typeof value === "string" && (ATTRIBUTE_KINDS as readonly string[]).includes(value);

/** Valida el cuerpo de `POST /api/[storeId]/attributes/archive`. */
export function parseAttributeArchiveBody(body: unknown): AttributeArchiveInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (!isKind(raw.kind)) {
    throw ErrorFactory.InvalidRequest(
      "El tipo de atributo debe ser categorías, subcategorías, tamaños, colores o diseños",
    );
  }
  const ids = Array.isArray(raw.ids)
    ? Array.from(new Set(raw.ids.filter((id): id is string => typeof id === "string" && id.length > 0)))
    : [];
  if (ids.length === 0) throw ErrorFactory.InvalidRequest("Selecciona al menos un atributo");
  if (ids.length > 200) throw ErrorFactory.InvalidRequest("Archiva como máximo 200 atributos a la vez");
  if (typeof raw.archived !== "boolean") {
    throw ErrorFactory.InvalidRequest("Indica si el atributo se archiva o se restaura");
  }
  return { kind: raw.kind, ids, archived: raw.archived };
}

/** Texto del aviso cuando una subcategoría o categoría todavía tiene contenido activo. */
export function blockedArchiveMessage(
  kind: "categories" | "types",
  blocked: { name: string; count: number }[],
): string {
  const items = blocked
    .slice(0, 3)
    .map((item) => `«${item.name}» (${item.count})`)
    .join(", ");
  const more = blocked.length > 3 ? ` y ${blocked.length - 3} más` : "";
  return kind === "categories"
    ? `Todavía hay productos activos en ${items}${more}. Muévelos a otra subcategoría o archívalos antes de archivarla.`
    : `Todavía hay subcategorías activas en ${items}${more}. Archívalas primero.`;
}

type ArchiveClient = PrismaClient | Prisma.TransactionClient;

export interface AttributeArchiveResult {
  count: number;
  /** Slugs de subcategorías afectadas; sus páginas en la tienda deben revalidarse. */
  categorySlugs: string[];
}

/**
 * Archiva o restaura atributos de una tienda. Quien llama ya verificó al
 * dueño. Archivar una subcategoría exige que no tenga productos activos;
 * archivar una categoría exige que no tenga subcategorías activas. Restaurar
 * nunca se bloquea. Los productos que usan el atributo no cambian.
 */
export async function setAttributesArchived(
  db: ArchiveClient,
  params: { storeId: string; input: AttributeArchiveInput; now?: Date },
): Promise<AttributeArchiveResult> {
  const { storeId } = params;
  const { kind, ids, archived } = params.input;
  const data = { isArchived: archived, archivedAt: archived ? params.now ?? new Date() : null };
  const where = { storeId, id: { in: ids } };
  const label = ATTRIBUTE_KIND_LABELS[kind].plural;

  const assertAllFound = (found: number) => {
    if (found !== ids.length) {
      throw ErrorFactory.NotFound(`Algunas ${label} no existen en esta tienda`);
    }
  };

  switch (kind) {
    case "categories": {
      const rows = await db.category.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          _count: { select: { products: { where: { isArchived: false } } } },
        },
      });
      assertAllFound(rows.length);
      if (archived) {
        const blocked = rows.filter((row) => row._count.products > 0);
        if (blocked.length > 0) {
          throw ErrorFactory.Conflict(
            blockedArchiveMessage("categories", blocked.map((row) => ({ name: row.name, count: row._count.products }))),
            { categories: blocked.map((row) => ({ id: row.id, name: row.name, products: row._count.products })) },
          );
        }
      }
      const result = await db.category.updateMany({ where, data });
      return { count: result.count, categorySlugs: rows.map((row) => row.slug).filter(Boolean) };
    }
    case "types": {
      const rows = await db.type.findMany({
        where,
        select: {
          id: true,
          name: true,
          categories: { select: { slug: true, isArchived: true } },
        },
      });
      assertAllFound(rows.length);
      if (archived) {
        const blocked = rows
          .map((row) => ({ name: row.name, count: row.categories.filter((category) => !category.isArchived).length }))
          .filter((row) => row.count > 0);
        if (blocked.length > 0) {
          throw ErrorFactory.Conflict(blockedArchiveMessage("types", blocked), { types: blocked });
        }
      }
      const result = await db.type.updateMany({ where, data });
      return {
        count: result.count,
        categorySlugs: rows.flatMap((row) => row.categories.map((category) => category.slug)).filter(Boolean),
      };
    }
    case "sizes": {
      assertAllFound(await db.size.count({ where }));
      const result = await db.size.updateMany({ where, data });
      return { count: result.count, categorySlugs: [] };
    }
    case "colors": {
      assertAllFound(await db.color.count({ where }));
      const result = await db.color.updateMany({ where, data });
      return { count: result.count, categorySlugs: [] };
    }
    case "designs": {
      assertAllFound(await db.design.count({ where }));
      const result = await db.design.updateMany({ where, data });
      return { count: result.count, categorySlugs: [] };
    }
  }
}

/** Rutas de la tienda que cambian al archivar o restaurar atributos. */
export function attributeRevalidationPaths(categorySlugs: string[]): string[] {
  return ["/", "/tienda", "/sitemap.xml", ...Array.from(new Set(categorySlugs)).map((slug) => `/categoria/${slug}`)];
}

export function attributeArchiveMessage(input: AttributeArchiveInput, count: number): string {
  const label = count === 1 ? ATTRIBUTE_KIND_LABELS[input.kind].singular : ATTRIBUTE_KIND_LABELS[input.kind].plural;
  const verb = input.archived ? (count === 1 ? "archivada" : "archivadas") : count === 1 ? "restaurada" : "restauradas";
  // Los sustantivos masculinos (tamaño, color, diseño) ajustan la terminación.
  const masculine = input.kind === "sizes" || input.kind === "colors" || input.kind === "designs";
  const participle = masculine ? verb.replace(/a(s?)$/, "o$1") : verb;
  return `${count} ${label} ${participle}`;
}
