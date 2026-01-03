import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { exportShipmentsToCSV } from "@/lib/shipment-export";
import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) throw ErrorFactory.Unauthenticated();
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
