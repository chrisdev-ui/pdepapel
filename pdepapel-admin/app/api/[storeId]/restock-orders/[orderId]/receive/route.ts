import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { createInventoryMovementBatch, type CreateInventoryMovementParams } from "@/lib/inventory";
import prismadb from "@/lib/prismadb";
import {
  deriveRestockStatus,
  describeReceiptPlanError,
  getRestockProgress,
  planReceipt,
  RECEIVABLE_STATUSES,
  receiptInputSchema,
  RESTOCK_STATUS_LABELS,
  transportationShare,
} from "@/lib/restock-orders";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

const isDuplicateReceipt = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * Recepción de mercancía: cada línea suma a lo recibido y crea un movimiento
 * de inventario con el costo puesto en bodega. La clave de idempotencia la
 * genera el diálogo al abrirse: un reintento con la misma clave no vuelve a
 * sumar stock (índice único por pedido + clave).
 */
export async function POST(req: Request, { params }: { params: { storeId: string; orderId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const parsed = receiptInputSchema.safeParse(await req.json());
    if (!parsed.success) throw ErrorFactory.InvalidRequest(parsed.error.issues[0]?.message ?? "Recepción no válida.");
    const input = parsed.data;

    const result = await prismadb.$transaction(async (tx) => {
      // Estado y líneas frescos dentro de la transacción: dos recepciones a la
      // vez no pueden leer el mismo «faltan».
      const order = await tx.restockOrder.findFirst({
        where: { id: params.orderId, storeId: params.storeId },
        include: { items: true },
      });
      if (!order) throw ErrorFactory.NotFound("El pedido de aprovisionamiento no existe.");
      if (!RECEIVABLE_STATUSES.includes(order.status)) {
        throw ErrorFactory.Conflict(
          `Solo se recibe mercancía de un pedido «Pedido al proveedor» o «Recibido en parte»; este está «${RESTOCK_STATUS_LABELS[order.status]}».`,
        );
      }

      const planned = planReceipt(order, input);
      if (!planned.ok) throw ErrorFactory.InvalidRequest(describeReceiptPlanError(planned.error));
      const { plan } = planned;

      // La recepción se registra primero: si la clave ya existe, P2002 aborta
      // la transacción antes de tocar inventario.
      const receipt = await tx.restockOrderReceipt.create({
        data: {
          storeId: params.storeId,
          restockOrderId: order.id,
          idempotencyKey: input.idempotencyKey,
          receivedUnits: plan.receivedUnits,
          lineCount: plan.lines.length,
          excessUnits: plan.excessUnits,
          updatedCosts: input.updateCosts,
          lines: plan.lines as unknown as Prisma.InputJsonArray,
          createdBy: `USER_${userId}`,
        },
      });

      for (const line of plan.lines) {
        await tx.restockOrderItem.update({
          where: { id: line.restockOrderItemId },
          data: { quantityReceived: { increment: line.quantity } },
        });
      }

      const movements: CreateInventoryMovementParams[] = plan.lines.map((line) => ({
        storeId: params.storeId,
        productId: line.productId,
        type: "RESTOCK_RECEIVED",
        quantity: line.quantity,
        reason: `Recepción del pedido ${order.orderNumber}`,
        description: line.excess > 0 ? `Recepción ${receipt.id} · ${line.excess} de más sobre lo pedido` : `Recepción ${receipt.id}`,
        referenceId: order.id,
        cost: line.landedUnitCost,
        createdBy: `USER_${userId}`,
      }));
      await createInventoryMovementBatch(tx, movements);

      if (input.updateCosts) {
        for (const line of plan.lines) {
          await tx.product.update({
            where: { id: line.productId },
            data: {
              acqPrice: line.unitCost,
              transportationCost: transportationShare(line.unitCost, order.totalAmount, order.shippingCost),
            },
          });
        }
      }
      if (input.assignSupplier) {
        await tx.product.updateMany({
          where: { id: { in: plan.lines.map((line) => line.productId) }, storeId: params.storeId, supplierId: null },
          data: { supplierId: order.supplierId },
        });
      }

      const fresh = await tx.restockOrderItem.findMany({ where: { restockOrderId: order.id } });
      const status = deriveRestockStatus(fresh, order.status);
      if (status !== order.status) {
        await tx.restockOrder.update({ where: { id: order.id }, data: { status } });
      }

      return { receipt, status, progress: getRestockProgress(fresh) };
    });

    // El stock cambió: la tienda y Redis deben verlo.
    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json(result, { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } });
  } catch (error) {
    if (isDuplicateReceipt(error)) {
      return handleErrorResponse(
        ErrorFactory.Conflict("Esta recepción ya se registró. Recarga la página para ver el estado actual."),
        "RESTOCK_ORDER_RECEIVE",
        { headers: corsHeaders },
      );
    }
    return handleErrorResponse(error, "RESTOCK_ORDER_RECEIVE", { headers: corsHeaders });
  }
}
