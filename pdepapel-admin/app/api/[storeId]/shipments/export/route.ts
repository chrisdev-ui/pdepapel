import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { exportShipmentsToCSV } from "@/lib/shipment-export";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { verifyStoreOwner } from "@/lib/utils";

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();

    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    // Fetch all shipments
    const shipments = await prismadb.shipping.findMany({
      where: {
        storeId: params.storeId,
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            fullName: true,
            phone: true,
            address: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Generate CSV
    const csvContent = exportShipmentsToCSV(shipments);

    // Return as downloadable file
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8;",
        "Content-Disposition": `attachment; filename="envios-${params.storeId}-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error: any) {
    return handleErrorResponse(error, "EXPORT_SHIPMENTS");
  }
}
