/**
 * Backfill de `Order.source` para los pedidos anteriores a que el servidor lo
 * fijara: solo los que se pueden clasificar con certeza. Lo demás (sobre todo
 * transferencias y contra entrega sin rastro de quién las creó) se queda en
 * `null` = desconocido; nada se adivina.
 *
 * Reglas, en orden (la primera que aplica gana):
 *   pos           tipo POINT_OF_SALE                          → POS   (solo el punto de venta crea ese tipo)
 *   feria         tipo FESTIVAL                               → FAIR  (solo la feria crea ese tipo)
 *   panel         CUSTOM/QUOTATION con la dueña como creadora → PANEL
 *   pago_en_linea STANDARD pagado por Bold/Wompi/PayU, con
 *                 cliente de la tienda (guestId o cliente con
 *                 sesión) y sin la dueña en el pedido         → STORE
 *   ga4           compra enviada a GA4 (solo la tienda manda
 *                 el clientId), sin la dueña en el pedido     → STORE
 *
 * Un pedido enlazado a una conversación de WhatsApp no entra en las reglas de
 * la tienda. Puro: lo usan `scripts/backfill-order-source.mjs` y sus pruebas.
 */

export const ORDER_SOURCE_GROUPS = Object.freeze({
  pos: "POS",
  feria: "FAIR",
  panel: "PANEL",
  pago_en_linea: "STORE",
  ga4: "STORE",
});

const ONLINE_METHODS = new Set(["Bold", "Wompi", "PayU"]);

/**
 * @param {{ type: string, createdBy: string | null, userId: string | null, guestId: string | null, analyticsPurchaseTrackedAt: Date | null, payment: { method: string } | null }} order
 * @param {{ ownerIds: Set<string>, whatsappOrderIds: Set<string>, id: string }} ctx
 * @returns {keyof typeof ORDER_SOURCE_GROUPS | null}
 */
export function classifyOrderSource(order, { ownerIds, whatsappOrderIds }) {
  if (order.type === "POINT_OF_SALE") return "pos";
  if (order.type === "FESTIVAL") return "feria";

  const byOwner = (order.createdBy && ownerIds.has(order.createdBy)) || (order.userId && ownerIds.has(order.userId));
  if (order.type === "CUSTOM" || order.type === "QUOTATION") return byOwner ? "panel" : null;
  if (byOwner || whatsappOrderIds.has(order.id)) return null;

  const storeCustomer = Boolean(order.guestId) || Boolean(order.userId);
  if (!storeCustomer) return null;
  if (order.type === "STANDARD" && order.payment && ONLINE_METHODS.has(order.payment.method)) return "pago_en_linea";
  if (order.analyticsPurchaseTrackedAt) return "ga4";
  return null;
}

/** Lee los pedidos sin origen de una tienda y arma el plan por grupo. */
export async function planOrderSourceBackfill(db, storeId) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { userId: true } });
  if (!store) throw new Error(`no existe la tienda ${storeId}`);
  const ownerIds = new Set([store.userId]);
  const linked = await db.conversation.findMany({ where: { storeId, orderId: { not: null } }, select: { orderId: true } });
  const whatsappOrderIds = new Set(linked.map((row) => row.orderId));

  const orders = await db.order.findMany({
    where: { storeId, source: null },
    select: { id: true, type: true, createdBy: true, userId: true, guestId: true, analyticsPurchaseTrackedAt: true, payment: { select: { method: true } } },
  });
  const groups = Object.fromEntries(Object.keys(ORDER_SOURCE_GROUPS).map((group) => [group, []]));
  let unknown = 0;
  for (const order of orders) {
    const group = classifyOrderSource(order, { ownerIds, whatsappOrderIds });
    if (group) groups[group].push(order.id);
    else unknown += 1;
  }
  return { storeId, withoutSource: orders.length, groups, unknown };
}

/** Escribe el plan en una transacción; cada grupo solo toca filas que siguen sin origen. */
export async function applyOrderSourceBackfill(db, plan) {
  return db.$transaction(
    async (tx) => {
      const written = {};
      for (const [group, ids] of Object.entries(plan.groups)) {
        if (!ids.length) {
          written[group] = 0;
          continue;
        }
        const result = await tx.order.updateMany({
          where: { id: { in: ids }, storeId: plan.storeId, source: null },
          data: { source: ORDER_SOURCE_GROUPS[group] },
        });
        written[group] = result.count;
      }
      return written;
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}
