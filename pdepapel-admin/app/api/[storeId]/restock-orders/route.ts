import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    const body = await req.json();

    const { supplierId, items, notes } = body; // items: { productId, quantity, cost }[]

    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    if (!supplierId) throw ErrorFactory.InvalidRequest("Supplier is required");
    if (!items || items.length === 0)
      throw ErrorFactory.InvalidRequest("Items are required");

    // Calculate total
    const totalAmount = items.reduce(
      (sum: number, item: any) => sum + item.quantity * item.cost,
      0,
    );

    // Generate Order Number (Simple auto-increment logic or random)
    // For simplicity, let's use a timestamp based one for now or count
    const count = await prismadb.restockOrder.count({
      where: { storeId: params.storeId },
    });
    const orderNumber = `PO-${(count + 1).toString().padStart(4, "0")}`;

    const restockOrder = await prismadb.restockOrder.create({
      data: {
        storeId: params.storeId,
        supplierId,
        orderNumber,
        status: body.status || "DRAFT",
        totalAmount,
        shippingCost: body.shippingCost || 0,
        notes,
        items: {
          create: items.map((item: any, idx: number) => ({
            productId: item.productId,
            quantity: item.quantity,
            cost: item.cost,
            subtotal: item.quantity * item.cost,
            index: idx,
          })),
        },
      },
    });

    return NextResponse.json(restockOrder, { headers: corsHeaders });
  } catch (error) {
    console.log("[RESTOCK_ODERS_POST]", error);
    return handleErrorResponse(error, "RESTOCK_ODERS_POST", {
      headers: corsHeaders,
    });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const restockOrders = await prismadb.restockOrder.findMany({
      where: {
        storeId: params.storeId,
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
          orderBy: {
            index: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(restockOrders, { headers: corsHeaders });
  } catch (error) {
    console.log("[RESTOCK_ODERS_GET]", error);
    return handleErrorResponse(error, "RESTOCK_ODERS_GET", {
      headers: corsHeaders,
    });
  }
}
