import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { assertRestockReferences, RESTOCK_ORDER_INCLUDE } from "@/lib/restock-orders-db";
import { allocateRestockOrderNumber, withOrderNumberRetry } from "@/lib/restock-order-numbers";
import { lineSubtotal, restockOrderInputSchema, summarizeLines } from "@/lib/restock-orders";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const parsed = restockOrderInputSchema.safeParse(await req.json());
    if (!parsed.success) throw ErrorFactory.InvalidRequest(parsed.error.issues[0]?.message ?? "Datos del pedido no válidos.");
    const input = parsed.data;

    await assertRestockReferences(params.storeId, input.supplierId, input.items.map((item) => item.productId));
    const totals = summarizeLines(input.items);

    const restockOrder = await withOrderNumberRetry(() =>
      prismadb.$transaction(async (tx) => {
        const orderNumber = await allocateRestockOrderNumber(tx, params.storeId);
        return tx.restockOrder.create({
          data: {
            storeId: params.storeId,
            supplierId: input.supplierId,
            orderNumber,
            status: input.status,
            totalAmount: totals.totalAmount,
            shippingCost: input.shippingCost,
            notes: input.notes || null,
            items: {
              create: input.items.map((item, index) => ({
                productId: item.productId,
                quantity: item.quantity,
                cost: item.cost,
                subtotal: lineSubtotal(item.quantity, item.cost),
                index,
              })),
            },
          },
          include: RESTOCK_ORDER_INCLUDE,
        });
      }),
    );

    return NextResponse.json(restockOrder, { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } });
  } catch (error) {
    return handleErrorResponse(error, "RESTOCK_ORDERS_POST", { headers: corsHeaders });
  }
}

export async function GET(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const supplierId = new URL(req.url).searchParams.get("supplierId")?.trim() || undefined;
    const restockOrders = await prismadb.restockOrder.findMany({
      where: { storeId: params.storeId, ...(supplierId ? { supplierId } : {}) },
      include: RESTOCK_ORDER_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(restockOrders, { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } });
  } catch (error) {
    return handleErrorResponse(error, "RESTOCK_ORDERS_GET", { headers: corsHeaders });
  }
}
