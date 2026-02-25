import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

export const maxDuration = 60; // Vercel hobby plan limit

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${process.env.SCHEDULER_SECRET}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!params.storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    console.log(`[BANK_TRANSFERS_CRON] Running for store: ${params.storeId}`);

    // Find all Bank Transfer orders that are older than 48 hours and still PENDING/CREATED
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const expiredOrders = await prismadb.order.findMany({
      where: {
        storeId: params.storeId,
        status: { in: ["PENDING", "CREATED"] },
        createdAt: { lt: fortyEightHoursAgo },
        payment: {
          method: "BankTransfer",
        },
      },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
      },
    });

    if (expiredOrders.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No expired bank transfers found.",
        cancelledCount: 0,
      });
    }

    console.log(
      `[BANK_TRANSFERS_CRON] Found ${expiredOrders.length} expired orders. Flagging for review...`,
    );

    // Flag them for admin review instead of cancelling automatically.
    // This leaves the PENDING status intact but adds a warning note to push for payment.
    const orderIds = expiredOrders.map((o) => o.id);

    await prismadb.order.updateMany({
      where: {
        id: { in: orderIds },
      },
      data: {
        adminNotes:
          "⚠️ ACCIÓN REQUERIDA: Transferencia bancaria vencida (>48h). Por favor, contacta al cliente para gestionar el pago o cancela el pedido manualmente.",
      },
    });

    return NextResponse.json({
      success: true,
      message: `Successfully flagged ${expiredOrders.length} expired bank transfer orders for review.`,
      flaggedOrders: expiredOrders.map((o) => o.orderNumber),
    });
  } catch (error) {
    console.error("[BANK_TRANSFERS_CRON_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
