import { ProductPresaleStatus } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import { availableStock } from "@/lib/available-stock";
import { createInventoryMovementBatchResilient } from "@/lib/inventory";
import { explodeKitMovements } from "@/lib/order-stock-movements";
import { PAID_PRESALE_LINE } from "@/lib/presale";
import prismadb from "@/lib/prismadb";

/**
 * Liberar una preventa: la mercancía llegó, así que los pedidos que la
 * esperaban salen al despacho normal.
 *
 * Es el único paso nuevo de la operación y hace tres cosas de una sola vez:
 *
 *  1. descuenta el inventario de las unidades vendidas, con su movimiento —
 *     hasta hoy no existían, así que este es el momento en que el kardex se
 *     entera de la venta;
 *  2. marca cada línea con `preorderReleasedAt`, que es lo que suelta el
 *     PEDIDO COMPLETO (también lo que ya estaba en bodega);
 *  3. cierra la campaña como RELEASED, con quién y cuándo.
 *
 * Todo va en una transacción: o se libera entero o no se libera nada. Media
 * liberación dejaría pedidos sueltos sin inventario descontado.
 *
 * «Liberar N» (llegó menos de lo vendido): salen completos los pedidos más
 * antiguos que caben en lo que hay; los demás quedan «sin unidad»
 * (`preorderUnfulfilledAt`), siguen frenados y son devoluciones. La campaña
 * se cierra igual: una segunda llegada no se reparte sola.
 */

export interface PresaleReleaseResult {
  presaleId: string;
  /** Unidades que se descontaron del inventario. */
  releasedUnits: number;
  /** Pedidos que quedaron libres para despachar. */
  releasedOrderIds: string[];
  /** Pedidos que siguen frenados porque traen OTRA preventa sin liberar. */
  stillHeldOrderIds: string[];
  /** «Liberar N»: pedidos que no alcanzaron unidad y hay que devolver. */
  unfulfilledOrderIds: string[];
  unfulfilledUnits: number;
}

export interface PartialReleaseOrder {
  orderId: string;
  units: number;
  /** Cuándo entró la plata: el anticipo, si no el pago completo, si no la creación. */
  paidAt: Date;
}

export interface PartialReleasePlan {
  releaseOrderIds: string[];
  releaseUnits: number;
  unfulfilledOrderIds: string[];
  unfulfilledUnits: number;
}

/**
 * Qué pedidos salen con lo que llegó: completos y del más antiguo al más
 * nuevo. Un pedido que no cabe se salta (no se parte) y el siguiente, más
 * pequeño, puede entrar todavía: «los pedidos más antiguos que caben».
 */
export function planPartialRelease(orders: PartialReleaseOrder[], available: number): PartialReleasePlan {
  const sorted = [...orders].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime() || a.orderId.localeCompare(b.orderId));
  let left = Math.max(0, available);
  const plan: PartialReleasePlan = { releaseOrderIds: [], releaseUnits: 0, unfulfilledOrderIds: [], unfulfilledUnits: 0 };
  for (const order of sorted) {
    if (order.units <= left) {
      left -= order.units;
      plan.releaseOrderIds.push(order.orderId);
      plan.releaseUnits += order.units;
    } else {
      plan.unfulfilledOrderIds.push(order.orderId);
      plan.unfulfilledUnits += order.units;
    }
  }
  return plan;
}

/** Lo que hace falta saber antes de liberar, para decidir si se puede. */
export async function getPresaleReleasePreview(
  storeId: string,
  presaleId: string,
) {
  const presale = await prismadb.productPresale.findFirst({
    where: { id: presaleId, storeId },
    select: {
      id: true,
      status: true,
      productId: true,
      expectedArrivalAt: true,
      unitLimit: true,
      committedUnits: true,
      product: {
        select: { id: true, name: true, sku: true, stock: true, reservedUnits: true, isKit: true },
      },
    },
  });
  if (!presale)
    throw ErrorFactory.NotFound("La preventa no existe en esta tienda");

  // Solo pedidos PAGADOS. Un carrito abandonado que quedó en PENDING no es una
  // venta: contarlo aquí haría que Paula liberara mercancía —y descontara
  // inventario— por unidades que nadie compró.
  const lines = await prismadb.orderItem.findMany({
    where: { ...PAID_PRESALE_LINE, presaleId, preorderReleasedAt: null, preorderUnfulfilledAt: null },
    select: {
      id: true,
      orderId: true,
      quantity: true,
      productId: true,
      order: {
        select: { id: true, orderNumber: true, status: true, fullName: true, depositPaidAt: true, paidAt: true, createdAt: true },
      },
    },
  });

  const pendingUnits = lines.reduce((total, line) => total + line.quantity, 0);
  const free = availableStock(presale.product);
  const isActive = presale.status === ProductPresaleStatus.ACTIVE;

  const byOrder = new Map<string, PartialReleaseOrder>();
  for (const line of lines) {
    const existing = byOrder.get(line.orderId);
    if (existing) {
      existing.units += line.quantity;
      continue;
    }
    byOrder.set(line.orderId, {
      orderId: line.orderId,
      units: line.quantity,
      paidAt: line.order?.depositPaidAt ?? line.order?.paidAt ?? line.order?.createdAt ?? new Date(0),
    });
  }
  const partialPlan = planPartialRelease(Array.from(byOrder.values()), free);

  return {
    presale,
    lines,
    pendingUnits,
    /** Lo apartado para otras clientas no se le da a la preventa. Un kit no guarda stock propio; sus componentes son los que mandan. */
    availableStock: free,
    canRelease: isActive && pendingUnits > 0 && free >= pendingUnits,
    /** Llegó menos de lo vendido pero alcanza para al menos un pedido completo. */
    canReleasePartial: isActive && pendingUnits > 0 && free < pendingUnits && partialPlan.releaseUnits > 0,
    partialPlan,
  };
}

export async function releasePresale(input: {
  storeId: string;
  presaleId: string;
  /** Clerk id de quien libera; queda en el movimiento y en la campaña. */
  releasedBy: string;
  /** «Liberar N»: Paula confirmó que sale solo lo que alcanza. */
  partial?: boolean;
  /** Las unidades que Paula vio en la confirmación: si cambiaron, no se libera a ciegas. */
  expectedReleaseUnits?: number;
}): Promise<PresaleReleaseResult> {
  const preview = await getPresaleReleasePreview(
    input.storeId,
    input.presaleId,
  );

  if (preview.presale.status !== ProductPresaleStatus.ACTIVE) {
    throw ErrorFactory.InvalidRequest("Esta preventa ya no está activa");
  }
  if (preview.lines.length === 0) {
    throw ErrorFactory.InvalidRequest(
      "Esta preventa no tiene pedidos pendientes por liberar",
    );
  }
  // Se comprueba antes de tocar nada: liberar sin mercancía dejaría el stock
  // en negativo y prometería despachos que no se pueden cumplir.
  const short = preview.availableStock < preview.pendingUnits;
  if (short && !input.partial) {
    throw ErrorFactory.InvalidRequest(
      `Faltan unidades en bodega: hay ${preview.availableStock} libres (sin contar lo apartado) y se necesitan ${preview.pendingUnits} para liberar esta preventa.` +
        (preview.canReleasePartial ? ` Puedes liberar ${preview.partialPlan.releaseUnits} con «Liberar lo que llegó».` : ""),
    );
  }
  if (short && !preview.canReleasePartial) {
    throw ErrorFactory.InvalidRequest(
      `Con ${preview.availableStock} libres no alcanza para ningún pedido completo. Revisa el stock o cancela los pedidos con su devolución.`,
    );
  }
  const plan = short
    ? preview.partialPlan
    : { releaseOrderIds: Array.from(new Set(preview.lines.map((line) => line.orderId))), releaseUnits: preview.pendingUnits, unfulfilledOrderIds: [], unfulfilledUnits: 0 };
  if (input.expectedReleaseUnits !== undefined && input.expectedReleaseUnits !== plan.releaseUnits) {
    throw ErrorFactory.Conflict(
      `Cambió lo que hay para liberar (ahora salen ${plan.releaseUnits} unidades). Vuelve a abrir «Liberar» para ver el reparto nuevo.`,
    );
  }
  const releaseSet = new Set(plan.releaseOrderIds);
  const releaseLines = preview.lines.filter((line) => releaseSet.has(line.orderId));
  const unfulfilledLines = preview.lines.filter((line) => !releaseSet.has(line.orderId));

  const now = new Date();
  const product = await prismadb.product.findFirst({
    where: { id: preview.presale.productId, storeId: input.storeId },
    select: { acqPrice: true, price: true },
  });

  return prismadb.$transaction(async (tx) => {
    // 1. El inventario se entera ahora, no cuando se vendió.
    const movements = await explodeKitMovements(
      tx,
      releaseLines.map((line) => ({
        productId: preview.presale.productId,
        storeId: input.storeId,
        type: "ORDER_PLACED" as const,
        quantity: -line.quantity,
        reason: `Preventa liberada · pedido #${line.order?.orderNumber ?? line.orderId}`,
        referenceId: line.orderId,
        cost: Number(product?.acqPrice) || 0,
        price: Number(product?.price) || 0,
        createdBy: input.releasedBy,
      })),
    );

    const stockResult = await createInventoryMovementBatchResilient(
      tx,
      movements,
    );
    if (stockResult.failed.length > 0) {
      // Si una sola línea no pudo descontar, no se libera nada: un pedido
      // suelto sin inventario descontado es peor que esperar un día más.
      throw ErrorFactory.InvalidRequest(
        `No se pudo descontar el inventario de ${stockResult.failed.length} línea(s). No se liberó nada.`,
      );
    }

    // 2. Cada línea queda liberada; eso es lo que suelta el pedido completo.
    // Se marcan exactamente las que se acaban de descontar, por id: si entre la
    // vista previa y la transacción entró otro pago, esa línea no tiene
    // movimiento de inventario y no puede darse por liberada.
    await tx.orderItem.updateMany({
      where: { id: { in: releaseLines.map((line) => line.id) } },
      data: { preorderReleasedAt: now },
    });
    // Los que no alcanzaron: siguen frenados y quedan marcados para devolver.
    if (unfulfilledLines.length > 0) {
      await tx.orderItem.updateMany({
        where: { id: { in: unfulfilledLines.map((line) => line.id) } },
        data: { preorderUnfulfilledAt: now },
      });
    }

    // 3. La campaña se cierra.
    await tx.productPresale.update({
      where: { id: input.presaleId },
      data: {
        status: ProductPresaleStatus.RELEASED,
        releasedAt: now,
        releasedBy: input.releasedBy,
      },
    });

    // Qué pedidos quedaron realmente libres: uno puede traer otra preventa.
    const orderIds = plan.releaseOrderIds;
    const stillHeld = await tx.orderItem.findMany({
      where: {
        orderId: { in: orderIds },
        isPreorder: true,
        preorderReleasedAt: null,
      },
      select: { orderId: true },
    });
    const stillHeldOrderIds = Array.from(
      new Set(stillHeld.map((row) => row.orderId)),
    );

    return {
      presaleId: input.presaleId,
      releasedUnits: plan.releaseUnits,
      releasedOrderIds: orderIds.filter(
        (id) => !stillHeldOrderIds.includes(id),
      ),
      stillHeldOrderIds,
      unfulfilledOrderIds: plan.unfulfilledOrderIds,
      unfulfilledUnits: plan.unfulfilledUnits,
    };
  });
}

/**
 * Deja constancia de que se avisó del retraso.
 *
 * El sistema avisa y anota; **las devoluciones de dinero se hacen a mano** en
 * Bold o Wompi, como cualquier otra. Aquí no se cancela ningún pedido ni se
 * mueve plata: es deliberado, no un pendiente.
 */
export async function recordPresaleDelayNotice(input: {
  storeId: string;
  presaleId: string;
  notifiedBy: string;
}) {
  const presale = await prismadb.productPresale.findFirst({
    where: { id: input.presaleId, storeId: input.storeId },
    select: { id: true, status: true },
  });
  if (!presale)
    throw ErrorFactory.NotFound("La preventa no existe en esta tienda");
  if (presale.status !== ProductPresaleStatus.ACTIVE) {
    throw ErrorFactory.InvalidRequest(
      "Solo se avisa de un retraso en una preventa que sigue activa",
    );
  }

  return prismadb.productPresale.update({
    where: { id: presale.id },
    data: { delayNotifiedAt: new Date(), delayNotifiedBy: input.notifiedBy },
    select: { id: true, delayNotifiedAt: true, delayNotifiedBy: true },
  });
}

/** A quién hay que avisarle: una clienta por pedido pagado, sin repetir. */
export async function getPresaleCustomers(storeId: string, presaleId: string) {
  const lines = await prismadb.orderItem.findMany({
    where: { ...PAID_PRESALE_LINE, presaleId, preorderReleasedAt: null, preorderUnfulfilledAt: null },
    select: {
      quantity: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          fullName: true,
          phone: true,
          email: true,
          storeId: true,
        },
      },
    },
  });

  const byOrder = new Map<
    string,
    {
      orderId: string;
      orderNumber: string;
      fullName: string;
      phone: string | null;
      email: string | null;
      units: number;
    }
  >();

  for (const line of lines) {
    const order = line.order;
    if (!order || order.storeId !== storeId) continue;
    const existing = byOrder.get(order.id);
    if (existing) {
      existing.units += line.quantity;
      continue;
    }
    byOrder.set(order.id, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      fullName: order.fullName,
      phone: order.phone ?? null,
      email: order.email ?? null,
      units: line.quantity,
    });
  }

  return Array.from(byOrder.values());
}
