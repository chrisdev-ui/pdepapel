import type { Prisma } from "@prisma/client";

type Db = Pick<Prisma.TransactionClient, "product">;

/**
 * Corrección del 0 exacto en «Envío y otros gastos por unidad» (decisión de
 * Christian, 2026-10-17): un producto activo con 0 pasa a null («no
 * registrado»). Los kits quedan fuera (su costo sale de sus piezas) y los
 * archivados no se tocan. El WHERE vuelve a exigir el 0 al escribir: es la
 * guarda del valor esperado.
 */
export const ZERO_TRANSPORT_WHERE = { transportationCost: 0, isArchived: false, isKit: false } satisfies Prisma.ProductWhereInput;

/** `storeId` acota a una tienda (las pruebas); el guion corre sobre la base entera, que es de una sola tienda. */
export async function zeroTransportPlan(db: Db, storeId?: string) {
  const scope = storeId ? { storeId } : {};
  const [ids, kits, archived] = await Promise.all([
    db.product.findMany({ where: { ...ZERO_TRANSPORT_WHERE, ...scope }, select: { id: true }, orderBy: { id: "asc" } }),
    db.product.count({ where: { transportationCost: 0, isArchived: false, isKit: true, ...scope } }),
    db.product.count({ where: { transportationCost: 0, isArchived: true, ...scope } }),
  ]);
  return { ids: ids.map((row) => row.id), kitsFuera: kits, archivadosFuera: archived };
}

/** Escribe null en los activos que siguen en 0, solo si son exactamente `expectRows`; si no, no escribe nada. */
export async function applyZeroTransportFix(expectRows: number, run: <T>(work: (tx: Db) => Promise<T>) => Promise<T>, storeId?: string) {
  if (!Number.isInteger(expectRows) || expectRows < 0) throw new Error("--expect-rows tiene que ser un entero de 0 en adelante.");
  return run(async (tx) => {
    const { ids } = await zeroTransportPlan(tx, storeId);
    if (ids.length !== expectRows) throw new Error(`Hay ${ids.length} productos activos en 0 y se esperaban ${expectRows}; no se escribe nada.`);
    const result = await tx.product.updateMany({ where: { id: { in: ids }, ...ZERO_TRANSPORT_WHERE }, data: { transportationCost: null } });
    if (result.count !== expectRows) throw new Error(`Se actualizaron ${result.count} y se esperaban ${expectRows}; no se escribe nada.`);
    return ids;
  });
}
