import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import prismadb from "@/lib/prismadb";
import { ShippingStatus } from "@prisma/client";
import { ShippingProvider } from "@prisma/client";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    const { status } = await req.json();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!params.storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    if (!status) {
      return new NextResponse("Status is required", { status: 400 });
    }

    // Verify store ownership
    const store = await prismadb.store.findFirst({
      where: {
        id: params.storeId,
        userId,
      },
    });

    if (!store) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Update all MANUAL shipments for this store that are not in the target status
    // We intentionally don't filter by 'not delivered' to allow corrections if needed
    const result = await prismadb.shipping.updateMany({
      where: {
        storeId: params.storeId,
        provider: ShippingProvider.MANUAL,
      },
      data: {
        status: status as ShippingStatus,
      },
    });

    return NextResponse.json({
      message: "Manual shipments updated",
      count: result.count,
    });
  } catch (error) {
    console.error("[SHIPMENT_BULK_MANUAL_UPDATE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
