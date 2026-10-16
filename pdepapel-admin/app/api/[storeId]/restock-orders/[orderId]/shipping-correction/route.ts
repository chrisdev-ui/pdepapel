import { auth } from "@clerk/nextjs/server";
import { RestockOrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createInventoryMovementBatch } from "@/lib/inventory";
import { movementActor } from "@/lib/movement-actor";
import prismadb from "@/lib/prismadb";
import { planShippingCorrection, RESTOCK_STATUS_LABELS } from "@/lib/restock-orders";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

const RECEIVED_STATUSES: RestockOrderStatus[] = [RestockOrderStatus.PARTIALLY_RECEIVED, RestockOrderStatus.COMPLETED];

const inputSchema = z.object({
  shippingCost: z.number().finite().min(0, "El envío debe ser de 0 en adelante."),
  confirm: z.boolean().default(false),
  /** Lo que la vista previa mostró como «hoy»: se escribe solo si nada cambió desde entonces. */
  expected: z.array(z.object({ productId: z.string().min(1), transportationCost: z.number().nullable() })).optional(),
});

type Tx = Parameters<Parameters<typeof prismadb.$transaction>[0]>[0];

async function loadPlan(tx: Tx, storeId: string, orderId: string, shippingCost: number) {
  const order = await tx.restockOrder.findFirst({ where: { id: orderId, storeId }, include: { items: true } });
  if (!order) throw ErrorFactory.NotFound("El pedido de aprovisionamiento no existe.");
  if (!RECEIVED_STATUSES.includes(order.status)) {
    throw ErrorFactory.Conflict(`Solo se corrige el envío de un pedido ya recibido; este está «${RESTOCK_STATUS_LABELS[order.status]}».`);
  }
  const productIds = Array.from(new Set(order.items.map((item) => item.productId)));
  const products = await tx.product.findMany({ where: { id: { in: productIds }, storeId }, select: { id: true, name: true, acqPrice: true, transportationCost: true, isKit: true } });
  // La última recepción de cada producto: su movimiento RESTOCK_RECEIVED más reciente (las recepciones viejas y las nuevas lo escriben).
  const receipts = await tx.inventoryMovement.findMany({
    where: { storeId, type: "RESTOCK_RECEIVED", productId: { in: productIds } },
    orderBy: { createdAt: "desc" },
    select: { productId: true, referenceId: true },
  });
  const lastOrderId = new Map<string, string>();
  for (const receipt of receipts) if (receipt.referenceId && !lastOrderId.has(receipt.productId)) lastOrderId.set(receipt.productId, receipt.referenceId);
  const orderNumbers = new Map(
    (await tx.restockOrder.findMany({ where: { id: { in: Array.from(new Set(lastOrderId.values())) }, storeId }, select: { id: true, orderNumber: true } })).map((row) => [row.id, row.orderNumber]),
  );
  const lastOrderByProduct = new Map(Array.from(lastOrderId.entries(), ([productId, id]) => [productId, { orderId: id, orderNumber: orderNumbers.get(id) ?? null }]));
  return { order, plan: planShippingCorrection({ order, products, lastOrderByProduct, newShipping: shippingCost }) };
}

/**
 * Corregir el envío de un pedido ya recibido: el envío real se reparte entre
 * sus líneas igual que la recepción y cambia el envío por unidad de los
 * productos cuya última recepción es este pedido. Sin `confirm` devuelve la
 * vista previa; con `confirm` escribe lo mismo, solo si cada producto conserva
 * el valor que la vista previa mostró, y deja un movimiento de 0 unidades con
 * el costo nuevo en el kardex. Repetirla no vuelve a escribir.
 */
export async function POST(req: Request, { params }: { params: { storeId: string; orderId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const parsed = inputSchema.safeParse(await req.json());
    if (!parsed.success) throw ErrorFactory.InvalidRequest(parsed.error.issues[0]?.message ?? "Corrección no válida.");
    const input = parsed.data;

    if (!input.confirm) {
      const { plan } = await prismadb.$transaction((tx) => loadPlan(tx, params.storeId, params.orderId, input.shippingCost));
      return NextResponse.json(plan, { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } });
    }
    if (!input.expected) throw ErrorFactory.InvalidRequest("Abre primero la vista previa.");
    const expected = new Map(input.expected.map((row) => [row.productId, row.transportationCost]));

    const result = await prismadb.$transaction(async (tx) => {
      const { order, plan } = await loadPlan(tx, params.storeId, params.orderId, input.shippingCost);
      const toChange = plan.lines.filter((line) => !line.skipped && line.shareAfter !== line.shareBefore);
      // Ya aplicada (mismo envío, mismos valores): nada que escribir.
      if (toChange.length === 0 && order.shippingCost === plan.shippingAfter) return { ...plan, changed: 0 };
      for (const line of toChange) {
        if (!expected.has(line.productId) || expected.get(line.productId) !== line.shareBefore) {
          throw ErrorFactory.Conflict("El costo de algún producto cambió desde la vista previa. Ábrela de nuevo.");
        }
        const updated = await tx.product.updateMany({
          where: { id: line.productId, storeId: params.storeId, transportationCost: line.shareBefore },
          data: { transportationCost: line.shareAfter },
        });
        if (updated.count !== 1) throw ErrorFactory.Conflict("El costo de algún producto cambió desde la vista previa. Ábrela de nuevo.");
      }
      await tx.restockOrder.update({ where: { id: order.id }, data: { shippingCost: plan.shippingAfter } });
      if (toChange.length > 0) await createInventoryMovementBatch(
        tx,
        toChange.map((line) => ({
          storeId: params.storeId,
          productId: line.productId,
          type: "MANUAL_ADJUSTMENT" as const,
          quantity: 0,
          reason: `Corrección de envío del pedido ${order.orderNumber}`,
          description: `Envío por unidad: ${line.shareBefore ?? "sin registrar"} → ${line.shareAfter ?? "sin registrar"}`,
          referenceId: order.id,
          cost: line.costAfter ?? undefined,
          createdBy: movementActor(userId),
        })),
      );
      return { ...plan, changed: toChange.length };
    });

    return NextResponse.json(result, { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } });
  } catch (error) {
    return handleErrorResponse(error, "RESTOCK_ORDER_SHIPPING_CORRECTION", { headers: corsHeaders });
  }
}
