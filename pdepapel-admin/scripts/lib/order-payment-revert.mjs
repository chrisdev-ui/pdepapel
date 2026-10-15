/**
 * Deshace un «Marcar como pagado» hecho por error sobre un pedido contra
 * entrega: vuelve a «Pendiente de pago», sin `paidAt`, sin la referencia de
 * pago y sin los financieros que se fijan al cobrar. Productos, precios,
 * clienta, dirección y método de pago no se tocan, y no se envía ningún correo
 * ni aviso (solo escrituras de Prisma, sin rutas ni helpers con efectos).
 *
 * Inventario: un contra entrega sin cobrar no retiene existencias. Se
 * descuentan cuando la mercancía sale (PENDIENTE → ENVIADO, a mano o porque la
 * transportadora la recoge), así que cada ORDER_PLACED del pago equivocado se
 * devuelve con su ORDER_CANCELLED. Si no, el envío descontaría por segunda vez.
 *
 * Con `hold`, esas unidades no vuelven a la venta: quedan apartadas para este
 * pedido en una reserva CONVERTED (la misma figura que deja «Convertir en
 * pedido»). El descuento del envío la consume y cancelar el pedido la libera,
 * así que lo disponible en la tienda y en Mercado Libre no cambia.
 */

export const PAID_FINANCIAL_FIELDS = ["totalProductCost", "gatewayFee", "shippingCost", "netProfit", "profitMarginPct"];

const ORDER_SELECT = {
  id: true,
  storeId: true,
  orderNumber: true,
  fullName: true,
  phone: true,
  status: true,
  paidAt: true,
  totalProductCost: true,
  gatewayFee: true,
  shippingCost: true,
  netProfit: true,
  profitMarginPct: true,
  giftCardId: true,
  couponId: true,
  payment: { select: { id: true, method: true, transactionId: true } },
  shipping: { select: { id: true, isCOD: true, status: true, envioClickIdOrder: true, trackingCode: true, guideError: true, guideAttemptedAt: true } },
};

/**
 * @param {{ storeId: string, orderId: string, orderNumber: string, reference: string }} target
 * @returns {Promise<{ ok: boolean, problems: string[], order: object | null, movements: { productId: string, quantity: number, cost: number | null, price: number | null }[], stock: Record<string, number> }>}
 */
export async function planOrderPaymentRevert(db, target) {
  const order = await db.order.findFirst({ where: { id: target.orderId, storeId: target.storeId }, select: ORDER_SELECT });
  const problems = [];
  if (!order) return { ok: false, problems: ["no existe el pedido en esa tienda"], order: null, movements: [], stock: {} };
  if (order.orderNumber !== target.orderNumber) problems.push("el número de pedido no coincide");
  if (order.status !== "PAID") problems.push(`el pedido está ${order.status}, no PAID`);
  if (order.payment?.method !== "COD") problems.push(`el método de pago es ${order.payment?.method ?? "ninguno"}, no COD`);
  if (order.payment?.transactionId !== target.reference) problems.push("la referencia de pago no es la esperada");
  if (order.shipping?.envioClickIdOrder || order.shipping?.trackingCode) problems.push("el pedido ya tiene guía: no se revierte a ciegas");
  if (order.giftCardId) problems.push("usa tarjeta de regalo");
  if (order.couponId) problems.push("usa cupón");

  const placed = await db.inventoryMovement.findMany({
    where: { storeId: target.storeId, referenceId: order.id, type: "ORDER_PLACED" },
    select: { productId: true, quantity: true, cost: true, price: true },
    orderBy: { createdAt: "asc" },
  });
  const returned = await db.inventoryMovement.count({ where: { storeId: target.storeId, referenceId: order.id, type: "ORDER_CANCELLED" } });
  if (placed.length === 0) problems.push("no hay ventas (ORDER_PLACED) que devolver");
  if (returned > 0) problems.push(`ya hay ${returned} devoluciones (ORDER_CANCELLED) de este pedido`);
  if (placed.some((movement) => movement.quantity >= 0)) problems.push("hay una venta con cantidad no negativa");

  const reservations = await db.stockReservation.count({ where: { storeId: target.storeId, orderId: order.id } });
  if (reservations > 0) problems.push(`tiene ${reservations} reservas convertidas`);

  const products = await db.product.findMany({
    where: { id: { in: placed.map((movement) => movement.productId) }, storeId: target.storeId },
    select: { id: true, stock: true, reservedUnits: true, isKit: true },
  });
  const stock = Object.fromEntries(products.map((product) => [product.id, product.stock]));
  const reserved = Object.fromEntries(products.map((product) => [product.id, product.reservedUnits]));
  if (products.length !== new Set(placed.map((movement) => movement.productId)).size) problems.push("falta algún producto de las ventas");
  // Las escrituras de stock de este guion no recalculan kits: con un kit de por medio, no se usa.
  const kitLinks = await db.productKit.count({ where: { OR: [{ kitId: { in: products.map((product) => product.id) } }, { componentId: { in: products.map((product) => product.id) } }] } });
  if (products.some((product) => product.isKit) || kitLinks > 0) problems.push("hay kits de por medio");

  return { ok: problems.length === 0, problems, order, movements: placed, stock, reserved };
}

/** Lo que se imprime antes y después: estados, fechas, ids y cantidades; nada de la clienta. */
export function describeOrderState(order) {
  return {
    status: order.status,
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    "payment.method": order.payment?.method ?? null,
    "payment.transactionId": order.payment?.transactionId ?? null,
    financieros: PAID_FINANCIAL_FIELDS.filter((field) => order[field] !== null).length ? "fijados" : "null",
    "shipping.isCOD": order.shipping?.isCOD ?? null,
    "shipping.status": order.shipping?.status ?? null,
    guia: order.shipping?.envioClickIdOrder ? "sí" : "no",
    guideError: order.shipping?.guideError ? `presente (${order.shipping.guideError.length} caracteres)` : null,
    guideAttemptedAt: order.shipping?.guideAttemptedAt ? order.shipping.guideAttemptedAt.toISOString() : null,
  };
}

/** Cantidad a devolver por producto, sumando si un producto se vendió en dos movimientos. */
export function stockToReturn(movements) {
  const totals = new Map();
  for (const movement of movements) totals.set(movement.productId, (totals.get(movement.productId) ?? 0) - movement.quantity);
  return totals;
}

export function assertExpectedRows(plan, expected) {
  if (!plan.ok) throw new Error(`no se puede revertir: ${plan.problems.join("; ")}. No escribo nada.`);
  if (expected !== 1) throw new Error(`--expect-rows dice ${expected} y el ensayo da 1 pedido: no escribo nada.`);
}

/**
 * Una transacción. Cada escritura del pedido y del pago va condicionada a lo
 * que el ensayo leyó: si alguien lo tocó en medio, no cambia nada.
 */
export async function applyOrderPaymentRevert(db, plan, target, { hold = true } = {}) {
  const { order } = plan;
  return db.$transaction(async (tx) => {
    const reverted = await tx.order.updateMany({
      where: { id: order.id, storeId: target.storeId, status: "PAID", paidAt: order.paidAt },
      data: { status: "PENDING", paidAt: null, ...Object.fromEntries(PAID_FINANCIAL_FIELDS.map((field) => [field, null])) },
    });
    if (reverted.count !== 1) throw new Error("el pedido cambió desde el ensayo; no se escribió nada");

    const payment = await tx.paymentDetails.updateMany({
      where: { orderId: order.id, storeId: target.storeId, method: "COD", transactionId: target.reference },
      data: { transactionId: null },
    });
    if (payment.count !== 1) throw new Error("el pago cambió desde el ensayo; no se escribió nada");

    // El método se queda en contra entrega; el envío se alinea para que las tarifas salgan con recaudo.
    const shipping = order.shipping && !order.shipping.isCOD
      ? (await tx.shipping.updateMany({ where: { id: order.shipping.id, storeId: target.storeId, envioClickIdOrder: null }, data: { isCOD: true } })).count
      : 0;

    const stock = {};
    let movements = 0;
    for (const placed of plan.movements) {
      const quantity = -placed.quantity;
      const updated = await tx.product.updateMany({ where: { id: placed.productId, storeId: target.storeId }, data: { stock: { increment: quantity } } });
      if (updated.count !== 1) throw new Error(`no se pudo devolver el producto ${placed.productId}`);
      const { stock: newStock } = await tx.product.findUniqueOrThrow({ where: { id: placed.productId }, select: { stock: true } });
      await tx.inventoryMovement.create({
        data: {
          storeId: target.storeId,
          productId: placed.productId,
          type: "ORDER_CANCELLED",
          quantity,
          previousStock: newStock - quantity,
          newStock,
          cost: placed.cost,
          price: placed.price,
          reason: `Pago revertido #${order.orderNumber}`,
          description: "Se marcó pagado por error. Es contra entrega: el inventario se descuenta cuando sale el envío.",
          referenceId: order.id,
          createdBy: "SYSTEM",
        },
      });
      stock[placed.productId] = newStock;
      movements += 1;
    }

    const reservation = hold ? await holdForOrder(tx, plan, target) : null;

    return { order: reverted.count, payment: payment.count, shipping, movements, stock, reservation };
  });
}

/** Reserva CONVERTED del pedido con lo devuelto; mismo UPDATE guardado que `adjustReservedUnits`. */
async function holdForOrder(tx, plan, target) {
  const { order } = plan;
  const entries = Array.from(stockToReturn(plan.movements).entries());
  const reservation = await tx.stockReservation.create({
    data: {
      storeId: target.storeId,
      productId: entries.length === 1 ? entries[0][0] : null,
      quantity: entries.length === 1 ? entries[0][1] : null,
      customerName: order.fullName,
      customerPhone: order.phone ?? "",
      note: `Apartado para el pedido ${order.orderNumber} (contra entrega) hasta que salga el envío.`,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
      status: "CONVERTED",
      orderId: order.id,
      createdBy: "SYSTEM",
    },
    select: { id: true },
  });
  await tx.stockReservationItem.createMany({
    data: entries.map(([productId, quantity]) => ({ storeId: target.storeId, reservationId: reservation.id, productId, quantity, addedBy: "SYSTEM" })),
  });
  await tx.stockReservationEvent.createMany({
    data: [
      { storeId: target.storeId, reservationId: reservation.id, kind: "created", actor: "SYSTEM", detail: { items: entries.length, via: "pago_revertido" } },
      { storeId: target.storeId, reservationId: reservation.id, kind: "converted", actor: "SYSTEM", detail: { orderId: order.id } },
    ],
  });
  const ids = entries.map(([id]) => id);
  const cases = entries.map(() => "WHEN ? THEN ?").join(" ");
  const caseArgs = entries.flatMap(([id, units]) => [id, units]);
  const affected = await tx.$executeRawUnsafe(
    `UPDATE \`Product\` SET \`reservedUnits\` = \`reservedUnits\` + CASE \`id\` ${cases} ELSE 0 END, \`updatedAt\` = NOW(3)
      WHERE \`storeId\` = ? AND \`id\` IN (${ids.map(() => "?").join(", ")}) AND \`stock\` - \`reservedUnits\` >= CASE \`id\` ${cases} ELSE 0 END`,
    ...caseArgs,
    target.storeId,
    ...ids,
    ...caseArgs,
  );
  if (affected !== ids.length) throw new Error("no alcanzó el stock para apartar lo devuelto; no se escribió nada");
  return reservation.id;
}
