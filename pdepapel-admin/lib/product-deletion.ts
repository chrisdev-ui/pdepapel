import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Qué impide eliminar un producto, dicho con nombres. Antes solo se miraban
 * los pedidos: kits, publicaciones de Mercado Libre, ferias, órdenes de
 * reposición y preventas fallaban con un «violaría una relación requerida»
 * que no decía nada, y el kardex se borraba en cascada sin aviso.
 */
export type DeleteBlockerKind =
  | "pedidos"
  | "kits"
  | "mercadolibre"
  | "ferias"
  | "reposicion"
  | "preventa"
  | "inventario";

export interface ProductDeleteBlocker {
  kind: DeleteBlockerKind;
  label: string;
  count: number;
  detail: string;
}

export interface ProductDeleteCheck {
  productId: string;
  name: string;
  slug: string;
  blocked: boolean;
  blockers: ProductDeleteBlocker[];
  /** Lo que desaparece si se elimina (solo informativo). */
  removes: { images: number; aliases: number; initialMovements: number };
}

type DeleteCheckClient = Pick<
  PrismaClient | Prisma.TransactionClient,
  "product"
>;

const INITIAL_MOVEMENT_TYPES = ["INITIAL_INTAKE", "INITIAL_MIGRATION"] as const;

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export async function getProductDeleteCheck(
  db: DeleteCheckClient,
  { storeId, productId }: { storeId: string; productId: string },
): Promise<ProductDeleteCheck | null> {
  const product = await db.product.findFirst({
    where: { id: productId, storeId },
    select: {
      id: true,
      name: true,
      slug: true,
      _count: {
        select: {
          orderItems: true,
          componentIn: true,
          marketplaceListings: true,
          fairInventoryItems: true,
          fairCapsules: true,
          restockOrderItems: true,
          presales: true,
          images: true,
          slugAliases: true,
          inventoryMovements: {
            where: { type: { in: [...INITIAL_MOVEMENT_TYPES] } },
          },
        },
      },
      inventoryMovements: {
        where: { type: { notIn: [...INITIAL_MOVEMENT_TYPES] } },
        select: { id: true },
      },
      componentIn: { select: { kit: { select: { name: true } } }, take: 3 },
      marketplaceListings: {
        select: { externalItemId: true, status: true },
        take: 3,
      },
      fairInventoryItems: {
        select: { fairEvent: { select: { name: true } } },
        take: 3,
      },
      presales: { select: { status: true }, take: 3 },
    },
  });
  if (!product) return null;

  const counts = product._count;
  const blockers: ProductDeleteBlocker[] = [];
  const push = (
    kind: DeleteBlockerKind,
    label: string,
    count: number,
    detail: string,
  ) => {
    if (count > 0) blockers.push({ kind, label, count, detail });
  };

  push(
    "pedidos",
    "Pedidos",
    counts.orderItems,
    `${plural(counts.orderItems, "pedido lo incluye", "pedidos lo incluyen")}; su historial se perdería.`,
  );
  push(
    "kits",
    "Kits",
    counts.componentIn,
    `Es componente de ${product.componentIn.map((row) => `«${row.kit.name}»`).join(", ")}${counts.componentIn > 3 ? ` y ${counts.componentIn - 3} más` : ""}.`,
  );
  push(
    "mercadolibre",
    "Mercado Libre",
    counts.marketplaceListings,
    `${plural(counts.marketplaceListings, "publicación vinculada", "publicaciones vinculadas")}${
      product.marketplaceListings[0]?.externalItemId
        ? ` (${product.marketplaceListings
            .map((row) => row.externalItemId)
            .filter(Boolean)
            .join(", ")})`
        : ""
    }. Desvincúlala primero desde Mercado Libre.`,
  );
  const fairCount = counts.fairInventoryItems + counts.fairCapsules;
  push(
    "ferias",
    "Ferias",
    fairCount,
    `Aparece en ${Array.from(new Set(product.fairInventoryItems.map((row) => `«${row.fairEvent.name}»`))).join(", ") || "una feria"}${counts.fairCapsules > 0 ? ` y en ${plural(counts.fairCapsules, "cápsula sorpresa", "cápsulas sorpresa")}` : ""}.`,
  );
  push(
    "reposicion",
    "Reposición",
    counts.restockOrderItems,
    `${plural(counts.restockOrderItems, "orden de reposición lo lleva", "órdenes de reposición lo llevan")}.`,
  );
  push(
    "preventa",
    "Preventa",
    counts.presales,
    `${plural(counts.presales, "preventa registrada", "preventas registradas")}.`,
  );
  push(
    "inventario",
    "Inventario",
    product.inventoryMovements.length,
    `${plural(product.inventoryMovements.length, "movimiento en el kardex", "movimientos en el kardex")} además de la entrada inicial; eliminar borraría ese historial.`,
  );

  return {
    productId: product.id,
    name: product.name,
    slug: product.slug,
    blocked: blockers.length > 0,
    blockers,
    removes: {
      images: counts.images,
      aliases: counts.slugAliases,
      initialMovements: counts.inventoryMovements,
    },
  };
}

/** Frase corta para el 409: «3 pedidos, componente de 2 kits». */
export function describeDeleteBlockers(check: ProductDeleteCheck): string {
  return check.blockers
    .map((blocker) => `${blocker.label}: ${blocker.detail}`)
    .join(" ");
}
