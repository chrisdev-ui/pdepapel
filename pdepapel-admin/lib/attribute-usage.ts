import { Prisma, PrismaClient } from "@prisma/client";

import type { MergeableKind } from "@/lib/attribute-merge";
import { MERGE_FIELD } from "@/lib/attribute-merge";

type Client = PrismaClient | Prisma.TransactionClient;

export interface AttributeUsage {
  activeProducts: number;
  archivedProducts: number;
  /** Grupos con variantes que usan el valor. */
  groups: number;
}

/** Cuánto se usa un valor: productos activos, archivados y grupos con variantes. */
export async function getAttributeUsage(db: Client, params: { storeId: string; kind: MergeableKind; id: string }): Promise<AttributeUsage> {
  const field = MERGE_FIELD[params.kind];
  const where = { storeId: params.storeId, [field]: params.id };
  const [activeProducts, archivedProducts, groups] = await Promise.all([
    db.product.count({ where: { ...where, isArchived: false } }),
    db.product.count({ where: { ...where, isArchived: true } }),
    db.product.findMany({ where: { ...where, productGroupId: { not: null } }, select: { productGroupId: true }, distinct: ["productGroupId"] }),
  ]);
  return { activeProducts, archivedProducts, groups: groups.length };
}

export interface AttributeSibling {
  id: string;
  name: string;
  usage: number;
  value?: string | null;
  parent?: string | null;
}

/** Valores activos de la familia, para las pistas de parecido y el destino de «Unir con otro». */
export async function getAttributeSiblings(db: Client, kind: MergeableKind, storeId: string): Promise<AttributeSibling[]> {
  const where = { storeId, isArchived: false };
  const orderBy = { name: "asc" as const };
  switch (kind) {
    case "categories": {
      const rows = await db.category.findMany({ where, orderBy, select: { id: true, name: true, type: { select: { name: true } }, _count: { select: { products: true } } } });
      return rows.map((row) => ({ id: row.id, name: row.name, usage: row._count.products, parent: row.type.name }));
    }
    case "sizes": {
      const rows = await db.size.findMany({ where, orderBy: { value: "asc" }, select: { id: true, name: true, value: true, _count: { select: { products: true } } } });
      return rows.map((row) => ({ id: row.id, name: row.name, usage: row._count.products, value: row.value }));
    }
    case "colors": {
      const rows = await db.color.findMany({ where, orderBy, select: { id: true, name: true, value: true, _count: { select: { products: true } } } });
      return rows.map((row) => ({ id: row.id, name: row.name, usage: row._count.products, value: row.value }));
    }
    case "designs": {
      const rows = await db.design.findMany({ where, orderBy, select: { id: true, name: true, _count: { select: { products: true } } } });
      return rows.map((row) => ({ id: row.id, name: row.name, usage: row._count.products }));
    }
  }
}
