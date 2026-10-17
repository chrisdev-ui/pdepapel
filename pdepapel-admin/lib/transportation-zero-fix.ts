import type { Prisma } from "@prisma/client";

import { inheritedTransport, isKnownTransport } from "@/lib/product-costs";

type Db = Pick<Prisma.TransactionClient, "product">;

/**
 * Corrección del 0 exacto en «Envío y otros gastos por unidad» (decisiones de
 * Christian, 2026-10-17). Un producto activo que no es kit y tiene 0:
 * - variante de un grupo cuyas hermanas activas (no kits) tienen exactamente un
 *   valor real → ese valor («desde hermana»);
 * - hermanas con valores distintos, ninguna con valor real, o producto suelto → null.
 * Archivados y kits no se tocan. Al escribir se vuelve a calcular todo: tiene
 * que coincidir con el plan que se revisó y cada fila tiene que seguir en 0.
 */
export const ZERO_TRANSPORT_WHERE = { transportationCost: 0, isArchived: false, isKit: false } satisfies Prisma.ProductWhereInput;

export interface ZeroTransportPlan {
  fromSibling: { id: string; value: number }[];
  toNull: string[];
  /** De `toNull`: variantes cuyas hermanas tienen valores reales distintos. */
  conflicts: number;
  kitsFuera: number;
  archivadosFuera: number;
}

/** `storeId` acota a una tienda (las pruebas); el guion corre sobre la base entera, que es de una sola tienda. */
export async function zeroTransportPlan(db: Db, storeId?: string): Promise<ZeroTransportPlan> {
  const scope = storeId ? { storeId } : {};
  const [zeros, kits, archived] = await Promise.all([
    db.product.findMany({ where: { ...ZERO_TRANSPORT_WHERE, ...scope }, select: { id: true, productGroupId: true }, orderBy: { id: "asc" } }),
    db.product.count({ where: { transportationCost: 0, isArchived: false, isKit: true, ...scope } }),
    db.product.count({ where: { transportationCost: 0, isArchived: true, ...scope } }),
  ]);
  const groupIds = Array.from(new Set(zeros.map((row) => row.productGroupId).filter((id): id is string => Boolean(id))));
  const siblings = groupIds.length
    ? await db.product.findMany({
        where: { productGroupId: { in: groupIds }, isArchived: false, isKit: false, ...scope },
        select: { productGroupId: true, transportationCost: true },
      })
    : [];
  const valuesByGroup = new Map<string, (number | null)[]>();
  for (const sibling of siblings) {
    if (!sibling.productGroupId) continue;
    valuesByGroup.set(sibling.productGroupId, [...(valuesByGroup.get(sibling.productGroupId) ?? []), sibling.transportationCost]);
  }
  const plan: ZeroTransportPlan = { fromSibling: [], toNull: [], conflicts: 0, kitsFuera: kits, archivadosFuera: archived };
  for (const row of zeros) {
    const values = row.productGroupId ? valuesByGroup.get(row.productGroupId) ?? [] : [];
    const value = inheritedTransport(values);
    if (value !== null) plan.fromSibling.push({ id: row.id, value });
    else {
      plan.toNull.push(row.id);
      if (new Set(values.filter(isKnownTransport)).size > 1) plan.conflicts += 1;
    }
  }
  return plan;
}

const planKey = (plan: Pick<ZeroTransportPlan, "fromSibling" | "toNull">) =>
  JSON.stringify({ fromSibling: [...plan.fromSibling].sort((a, b) => a.id.localeCompare(b.id)), toNull: [...plan.toNull].sort() });

/**
 * Escribe el plan solo si, recalculado dentro de la transacción, es idéntico al
 * revisado (mismas filas, mismos valores de las hermanas) y suma `expectRows`;
 * cada fila se escribe solo si sigue en 0. Si algo no coincide, nada.
 */
export async function applyZeroTransportFix(
  expected: Pick<ZeroTransportPlan, "fromSibling" | "toNull">,
  expectRows: number,
  run: <T>(work: (tx: Db) => Promise<T>) => Promise<T>,
  storeId?: string,
) {
  if (!Number.isInteger(expectRows) || expectRows < 0) throw new Error("--expect-rows tiene que ser un entero de 0 en adelante.");
  const total = expected.fromSibling.length + expected.toNull.length;
  if (total !== expectRows) throw new Error(`El plan tiene ${total} filas y se esperaban ${expectRows}; no se escribe nada.`);
  return run(async (tx) => {
    const current = await zeroTransportPlan(tx, storeId);
    if (planKey(current) !== planKey(expected)) {
      throw new Error("El envío de algún producto o de sus hermanas cambió desde el ensayo; vuelve a correr el ensayo. No se escribe nada.");
    }
    let written = 0;
    const byValue = new Map<number, string[]>();
    for (const row of expected.fromSibling) byValue.set(row.value, [...(byValue.get(row.value) ?? []), row.id]);
    const writes: { ids: string[]; value: number | null }[] = [...Array.from(byValue, ([value, ids]) => ({ ids, value })), { ids: expected.toNull, value: null }];
    for (const write of writes) {
      if (write.ids.length === 0) continue;
      const result = await tx.product.updateMany({ where: { id: { in: write.ids }, ...ZERO_TRANSPORT_WHERE }, data: { transportationCost: write.value } });
      if (result.count !== write.ids.length) throw new Error(`Se esperaban ${write.ids.length} productos en 0 y se actualizaron ${result.count}; no se escribe nada.`);
      written += result.count;
    }
    return { written, fromSibling: expected.fromSibling.length, toNull: expected.toNull.length };
  });
}
