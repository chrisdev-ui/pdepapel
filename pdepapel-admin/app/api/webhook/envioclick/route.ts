import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getColombiaDate } from "@/lib/date-utils";
import { sendShippingEmail } from "@/lib/email";
import prismadb from "@/lib/prismadb";
import { ShippingStatus } from "@prisma/client";
import { NextResponse } from "next/server";

const STATUS_MAP: Record<string, ShippingStatus> = {
  "01": ShippingStatus.Shipped,
  "02": ShippingStatus.PickedUp,
  "03": ShippingStatus.InTransit,
  "04": ShippingStatus.OutForDelivery,
  "05": ShippingStatus.Delivered,
  "06": ShippingStatus.FailedDelivery,
  "07": ShippingStatus.Returned,
  "08": ShippingStatus.Cancelled,
  "09": ShippingStatus.Exception,
};

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const { data } = payload;

    // Find shipping by EnvioClick order ID or reference
    const shipping = await prismadb.shipping.findFirst({
      where: {
        OR: [
          { envioClickIdOrder: data.idOrder },
          { myShipmentReference: data.myShipmentReference },
        ],
      },
      include: { order: true },
    });

    if (!shipping)
      return NextResponse.json(
        { error: "Shipping record not found" },
        { status: 404 },
      );

    const newStatus = STATUS_MAP[data.statusCode] || shipping.status;

    // Update shipping record
    await prismadb.shipping.update({
      where: { id: shipping.id },
      data: {
        status: newStatus,
        trackingUrl: data.trackingUrl,
        pickupDate: data.realPickupDate
          ? new Date(data.realPickupDate)
          : undefined,
        actualDeliveryDate: data.receivedBy
          ? new Date(data.timestamp)
          : undefined,
        estimatedDeliveryDate: data.estimatedDeliveryDate
          ? new Date(data.estimatedDeliveryDate)
          : undefined,
      },
    });

    if (data.events && data.events.length > 0) {
      await prismadb.shippingTrackingEvent.createMany({
        data: data.events.map((event: any) => ({
          shippingId: shipping.id,
          status: event.status,
          description: event.statusDetail,
          location: event.location || null,
          timestamp: new Date(event.timestamp),
        })),
        skipDuplicates: true,
      });
    }

    // Send email notification based on new status
    setImmediate(async () => {
      await sendShippingEmail(shipping.order, newStatus);
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        error,
      },
      { status: 500 },
    );
  }
}
