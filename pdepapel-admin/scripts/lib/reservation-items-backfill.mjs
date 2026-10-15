/**
 * Reservas v2, backfill: cada reserva anterior a los ítems recibe un ítem con
 * el producto, la cantidad y el «sin respaldo» de su encabezado (todas, las
 * cerradas también: el historial lee ítems en la fase 2). Idempotente: solo
 * toca reservas sin ítems y `skipDuplicates` cubre una carrera con el código
 * que ya escribe ítems. Lo usan `scripts/backfill-reservation-items.mjs` y
 * sus pruebas; solo devuelve conteos.
 */

/** @param {{ storeId?: string | null }} [scope] */
const scopeWhere = ({ storeId } = {}) => (storeId ? { storeId } : {});

export async function planReservationItemsBackfill(db, scope = {}) {
  const missing = await db.stockReservation.findMany({
    where: { ...scopeWhere(scope), productId: { not: null }, quantity: { not: null }, items: { none: {} } },
    select: { id: true, storeId: true, productId: true, quantity: true, unbackedAt: true, createdBy: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return { missing };
}

export function itemsFor(missing) {
  return missing.map((hold) => ({
    storeId: hold.storeId,
    reservationId: hold.id,
    productId: hold.productId,
    quantity: hold.quantity,
    unbackedAt: hold.unbackedAt,
    addedBy: hold.createdBy,
    createdAt: hold.createdAt,
  }));
}

export async function applyReservationItemsBackfill(db, plan) {
  if (plan.missing.length === 0) return 0;
  const result = await db.stockReservationItem.createMany({ data: itemsFor(plan.missing), skipDuplicates: true });
  return result.count;
}

/**
 * Lo que debe cumplirse después: ninguna reserva sin ítems y, mientras el
 * encabezado lleve producto, un solo ítem igual a él (producto, cantidad y
 * si está sin respaldo).
 */
export async function verifyReservationItems(db, scope = {}) {
  const holds = await db.stockReservation.findMany({
    where: scopeWhere(scope),
    select: {
      status: true,
      productId: true,
      quantity: true,
      unbackedAt: true,
      items: { select: { productId: true, quantity: true, unbackedAt: true } },
    },
  });
  const byStatus = {};
  let items = 0;
  let withoutItems = 0;
  let mismatched = 0;
  for (const hold of holds) {
    byStatus[hold.status] = (byStatus[hold.status] ?? 0) + 1;
    items += hold.items.length;
    if (hold.items.length === 0) withoutItems += 1;
    if (hold.productId === null) continue;
    const [item] = hold.items;
    const same =
      hold.items.length === 1 &&
      item.productId === hold.productId &&
      item.quantity === hold.quantity &&
      (item.unbackedAt === null) === (hold.unbackedAt === null);
    if (!same) mismatched += 1;
  }
  return { reservations: holds.length, items, withoutItems, mismatched, byStatus };
}
