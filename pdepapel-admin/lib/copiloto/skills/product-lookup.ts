import { CopilotQueryFailure, withCopilotQuery, type CopilotDb } from "@/lib/copiloto/db";
import { decideProduct, foldText, matchTokens, skuLikeTokens } from "@/lib/copiloto/skills/product-match";

/**
 * Buscar en la base el producto que Paula nombra, como lo diría ella: por SKU
 * exacto, o por palabras (sin tildes, en singular, con «x50» como «50») en
 * nombre, SKU, categoría y grupo; gana el que coincide en más palabras (ver
 * product-match.ts). Lo usan `productoParaDescripcion` y `precioDeKit`.
 */

export const LOOKUP_CAP = 400;

export type LookupState = "activo" | "desactivado";

export interface CandidateView {
  nombre: string;
  sku: string | null;
  categoria: string | null;
  estado: LookupState;
}

/** Grupos cuyo nombre coincide; aparte porque necesita un permiso que puede faltar. */
export async function findGroups(storeId: string, query: string): Promise<{ id: string; name: string }[]> {
  const stems = matchTokens(query).filter((token) => !/^\d+$/.test(token) && token.length >= 3);
  if (!stems.length) return [];
  try {
    return await withCopilotQuery((db) =>
      db.productGroup.findMany({ where: { storeId, OR: stems.map((token) => ({ name: { contains: token } })) }, select: { id: true, name: true }, take: 100 }),
    );
  } catch (error) {
    if (error instanceof CopilotQueryFailure) return [];
    throw error;
  }
}

const view = (candidate: { name: string; sku: string | null; category: string | null }, estado: LookupState): CandidateView => ({
  nombre: candidate.name.trim(),
  sku: candidate.sku,
  categoria: candidate.category,
  estado,
});

interface LookupRow {
  id: string;
  name: string;
  sku: string;
  isArchived: boolean;
  soldCount: number;
  productGroupId: string | null;
  category: { name: string } | null;
}

export type LookupResult<T> =
  | { kind: "match"; product: T }
  | { kind: "inactive"; candidates: CandidateView[] }
  | { kind: "ambiguous"; candidates: CandidateView[]; rows: T[] }
  | { kind: "none"; closest: CandidateView[]; rows: T[] };

/**
 * Activos y desactivados se puntúan juntos (`includeArchived`, por defecto):
 * un desactivado que empata o le gana a un activo se ofrece con su estado para
 * preguntar «¿es este?». Sin `includeArchived` solo se buscan activos. Lo que
 * tenga forma de SKU se busca primero exacto.
 */
export async function findProduct<T extends object>(
  db: CopilotDb,
  storeId: string,
  input: { sku?: string; nombre?: string },
  groups: { id: string; name: string }[],
  options: { select: Record<string, unknown>; includeArchived?: boolean },
): Promise<LookupResult<T & LookupRow>> {
  const includeArchived = options.includeArchived ?? true;
  const scope = includeArchived ? { storeId } : { storeId, isArchived: false };
  const select = { ...options.select, id: true, name: true, sku: true, isArchived: true, soldCount: true, productGroupId: true, category: { select: { name: true } } };
  type Row = T & LookupRow;
  const query = input.nombre ?? input.sku ?? "";
  const skus = Array.from(new Set([...(input.sku ? [input.sku.trim().toUpperCase()] : []), ...skuLikeTokens(query)]));
  for (const sku of skus) {
    const bySku = (await db.product.findFirst({ where: { ...scope, sku }, select })) as unknown as Row | null;
    if (bySku && !bySku.isArchived) return { kind: "match", product: bySku };
    if (bySku) return { kind: "inactive", candidates: [view({ name: bySku.name, sku: bySku.sku, category: bySku.category?.name ?? null }, "desactivado")] };
  }
  const stems = matchTokens(query).filter((token) => !/^\d+$/.test(token) && token.length >= 3);
  if (!stems.length) return { kind: "none", closest: [], rows: [] };
  const groupName = new Map(groups.map((group) => [group.id, group.name]));
  const matchesStem = (token: string) => {
    const groupIds = groups.filter((group) => foldText(group.name).includes(token)).map((group) => group.id);
    return [
      { name: { contains: token } },
      { sku: { contains: token } },
      { category: { name: { contains: token } } },
      ...(groupIds.length ? [{ productGroupId: { in: groupIds } }] : []),
    ];
  };
  // Con todas las palabras primero: una palabra suelta («kit», «lapicero») trae
  // cientos de productos y el tope dejaría por fuera el que es.
  const search = async (where: object) =>
    (await db.product.findMany({
      where: { ...scope, ...where },
      select,
      orderBy: [{ soldCount: "desc" }, { id: "asc" }],
      take: LOOKUP_CAP,
    })) as unknown as Row[];
  let rows = await search({ AND: stems.map((token) => ({ OR: matchesStem(token) })) });
  if (!rows.length) rows = await search({ OR: stems.flatMap(matchesStem) });
  const decision = decideProduct(
    query,
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      category: row.category?.name ?? null,
      group: row.productGroupId ? groupName.get(row.productGroupId) ?? null : null,
      soldCount: row.soldCount,
      estado: (row.isArchived ? "desactivado" : "activo") as LookupState,
      row,
    })),
  );
  if (decision.kind === "match") {
    return decision.product.estado === "activo" ? { kind: "match", product: decision.product.row } : { kind: "inactive", candidates: [view(decision.product, "desactivado")] };
  }
  if (decision.kind === "ambiguous") return { kind: "ambiguous", candidates: decision.candidates.map((row) => view(row, row.estado)), rows: decision.candidates.map((row) => row.row) };
  return { kind: "none", closest: decision.closest.map((row) => view(row, row.estado)), rows: decision.closest.map((row) => row.row) };
}
