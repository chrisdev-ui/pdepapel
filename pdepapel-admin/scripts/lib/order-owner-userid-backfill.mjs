/**
 * Pedidos anteriores a fa004368 (2026-07-22) con el id de la dueña en
 * `Order.userId`: el panel guardaba a quien creaba el pedido como si fuera la
 * clienta. El backfill pasa a la dueña a `createdBy` (si no estaba) y deja
 * `userId` en null; nada más del pedido cambia y no se envía ningún correo
 * (solo `updateMany` sobre `Order`).
 *
 * `source` = PANEL solo con prueba de origen («creado pagado»): un movimiento
 * ORDER_PLACED del pedido a menos de 30 s de su creación, con un medio de pago
 * que no es en línea. `POST /orders` solo descuenta existencias al crear
 * cuando el cuerpo trae `status` PAID, y la tienda nunca mandó un estado del
 * pedido (revisadas todas sus versiones desde que existe el kardex, 2026-01);
 * en producción esos movimientos caen entre 1 y 5 s, y el siguiente grupo
 * pasa del minuto. Los demás se quedan en null: con la sesión de la dueña la
 * tienda también mandaba su id en el cuerpo, así que el id solo no distingue.
 */

export const CREATED_PAID_WINDOW_MS = 30_000;
const ONLINE_METHODS = new Set(["Bold", "Wompi", "PayU"]);
const KARDEX_SINCE = new Date("2026-01-02T00:00:00.000Z");

/**
 * @param {{ createdAt: Date, payment: { method: string } | null }} order
 * @param {Date[]} placedAt fechas de los ORDER_PLACED del pedido
 */
export function classifyOwnerOrder(order, placedAt) {
  if (order.payment && ONLINE_METHODS.has(order.payment.method)) return "pago_en_linea";
  const createdPaid = placedAt.some((at) => Math.abs(at.getTime() - order.createdAt.getTime()) <= CREATED_PAID_WINDOW_MS);
  if (createdPaid) return "panel_creado_pagado";
  return order.createdAt < KARDEX_SINCE ? "sin_prueba_antes_del_kardex" : "sin_prueba";
}

export async function planOrderOwnerBackfill(db, storeId) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { userId: true } });
  if (!store) throw new Error(`no existe la tienda ${storeId}`);
  const ownerId = store.userId;

  const orders = await db.order.findMany({
    where: { storeId, userId: ownerId },
    select: { id: true, createdAt: true, createdBy: true, source: true, payment: { select: { method: true } } },
  });
  const ids = orders.map((order) => order.id);
  const moves = ids.length
    ? await db.inventoryMovement.findMany({
        where: { storeId, type: "ORDER_PLACED", referenceId: { in: ids } },
        select: { referenceId: true, createdAt: true },
      })
    : [];
  const placed = new Map();
  for (const move of moves) placed.set(move.referenceId, [...(placed.get(move.referenceId) ?? []), move.createdAt]);

  const buckets = { panel_creado_pagado: [], pago_en_linea: [], sin_prueba: [], sin_prueba_antes_del_kardex: [] };
  for (const order of orders) buckets[classifyOwnerOrder(order, placed.get(order.id) ?? [])].push(order.id);

  return {
    storeId,
    ownerId,
    ids,
    withoutCreator: orders.filter((order) => !order.createdBy).map((order) => order.id),
    panelIds: buckets.panel_creado_pagado.filter((id) => orders.find((order) => order.id === id).source === null),
    buckets: Object.fromEntries(Object.entries(buckets).map(([name, list]) => [name, list.length])),
  };
}

/** «Exactamente esos»: si el conteo del ensayo cambió, no se escribe nada. */
export function assertExpectedRows(plan, expected) {
  if (plan.ids.length !== expected) {
    throw new Error(`el ensayo da ${plan.ids.length} pedidos y --expect-rows dice ${expected}: no escribo nada.`);
  }
}

/** Una transacción: creadora, luego la clienta en null, luego PANEL solo con prueba. */
export async function applyOrderOwnerBackfill(db, plan) {
  if (plan.ids.length === 0) return { createdBy: 0, userId: 0, source: 0 };
  return db.$transaction(
    async (tx) => {
      const createdBy = await tx.order.updateMany({
        where: { storeId: plan.storeId, id: { in: plan.withoutCreator }, userId: plan.ownerId, OR: [{ createdBy: null }, { createdBy: "" }] },
        data: { createdBy: plan.ownerId },
      });
      const source = plan.panelIds.length
        ? await tx.order.updateMany({
            where: { storeId: plan.storeId, id: { in: plan.panelIds }, userId: plan.ownerId, source: null },
            data: { source: "PANEL" },
          })
        : { count: 0 };
      const userId = await tx.order.updateMany({
        where: { storeId: plan.storeId, id: { in: plan.ids }, userId: plan.ownerId },
        data: { userId: null },
      });
      return { createdBy: createdBy.count, userId: userId.count, source: source.count };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

export async function verifyOrderOwnerBackfill(db, storeId) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { userId: true } });
  if (!store) throw new Error(`no existe la tienda ${storeId}`);
  const [ownerAsCustomer, ownerAsCreator, bySource] = await Promise.all([
    db.order.count({ where: { storeId, userId: store.userId } }),
    db.order.count({ where: { storeId, createdBy: store.userId } }),
    db.order.groupBy({ by: ["source"], where: { storeId }, _count: { _all: true } }),
  ]);
  return {
    ownerAsCustomer,
    ownerAsCreator,
    bySource: Object.fromEntries(bySource.map((row) => [row.source ?? "null", row._count._all])),
  };
}
