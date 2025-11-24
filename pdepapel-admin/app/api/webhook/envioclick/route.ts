import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getColombiaDate } from "@/lib/date-utils";
import { sendShippingEmail } from "@/lib/email";
import prismadb from "@/lib/prismadb";
import { ShippingStatus } from "@prisma/client";
import { NextResponse } from "next/server";

// CORS headers for webhook
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Map EnvioClick status strings to our ShippingStatus enum
const STATUS_MAP: Record<string, ShippingStatus> = {
  // EnvioClick text-based statuses
  Entregado: ShippingStatus.Delivered,
  "En tránsito": ShippingStatus.InTransit,
  "Pendiente de Recolección": ShippingStatus.Preparing,
  "Envío Recolectado": ShippingStatus.PickedUp,
  Devuelto: ShippingStatus.Returned,
  Cancelado: ShippingStatus.Cancelled,
  Excepción: ShippingStatus.Exception,
  "En reparto": ShippingStatus.OutForDelivery,
  "Intento de entrega fallido": ShippingStatus.FailedDelivery,

  // Legacy numeric codes (if still used)
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

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    console.log(
      "[ENVIOCLICK_WEBHOOK] Received payload:",
      JSON.stringify(payload, null, 2),
    );

    // EnvioClick sends data directly in the body, not nested in "data"
    const {
      idOrder,
      myShipmentReference,
      trackingCode,
      realPickupDate,
      arrivalDate,
      realDeliveryDate,
      events = [],
    } = payload;

    // Find shipping by EnvioClick order ID or reference
    const shipping = await prismadb.shipping.findFirst({
      where: {
        OR: [
          { envioClickIdOrder: idOrder },
          { myShipmentReference: myShipmentReference },
        ],
      },
      include: { order: true },
    });

    if (!shipping) {
      console.error("[ENVIOCLICK_WEBHOOK] Shipping not found:", {
        idOrder,
        myShipmentReference,
      });
      return NextResponse.json(
        { error: "Shipping record not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    // Get the latest status from events (most recent first)
    const latestEvent = events.length > 0 ? events[0] : null;
    const newStatus = latestEvent
      ? STATUS_MAP[latestEvent.statusStep] || shipping.status
      : shipping.status;

    console.log("[ENVIOCLICK_WEBHOOK] Processing update:", {
      shippingId: shipping.id,
      oldStatus: shipping.status,
      newStatus,
      statusStep: latestEvent?.statusStep,
      eventsCount: events.length,
    });

    // Update shipping record
    await prismadb.shipping.update({
      where: { id: shipping.id },
      data: {
        status: newStatus,
        trackingCode: trackingCode || shipping.trackingCode,
        pickupDate: realPickupDate
          ? new Date(realPickupDate)
          : shipping.pickupDate,
        estimatedDeliveryDate: arrivalDate
          ? new Date(arrivalDate)
          : shipping.estimatedDeliveryDate,
        actualDeliveryDate: realDeliveryDate
          ? new Date(realDeliveryDate)
          : shipping.actualDeliveryDate,
        // Store receivedBy in notes if delivered
        notes: latestEvent?.receivedBy
          ? `Recibido por: ${latestEvent.receivedBy}`
          : shipping.notes,
      },
    });

    // Store tracking events
    if (events.length > 0) {
      for (const event of events) {
        try {
          // Check if event already exists to avoid duplicates
          const existingEvent = await prismadb.shippingTrackingEvent.findFirst({
            where: {
              shippingId: shipping.id,
              timestamp: new Date(event.timestamp),
              status: event.statusStep || event.status,
            },
          });

          if (!existingEvent) {
            // Build description with all available info
            let eventDescription = event.description || event.statusDetail;

            // Add incidence info if present
            if (event.incidence) {
              eventDescription += ` [INCIDENCIA${event.incidenceType ? `: ${event.incidenceType}` : ""}]`;
            }

            // Add receivedBy if present
            if (event.receivedBy) {
              eventDescription += ` (Recibido por: ${event.receivedBy})`;
            }

            await prismadb.shippingTrackingEvent.create({
              data: {
                shippingId: shipping.id,
                status: event.statusStep || event.status, // Use statusStep (macro) not status
                description: eventDescription,
                location: event.location || null,
                timestamp: new Date(event.timestamp),
              },
            });
          }
        } catch (eventError) {
          console.error("[ENVIOCLICK_WEBHOOK] Error saving event:", eventError);
          // Continue processing other events
        }
      }
    }

    // Send email notification if status changed
    if (newStatus !== shipping.status) {
      setImmediate(async () => {
        try {
          await sendShippingEmail(shipping.order, newStatus);
        } catch (emailError) {
          console.error(
            "[ENVIOCLICK_WEBHOOK] Failed to send email:",
            emailError,
          );
        }
      });
    }

    console.log("[ENVIOCLICK_WEBHOOK] Successfully processed webhook");
    return NextResponse.json(
      { success: true },
      { status: 200, headers: corsHeaders },
    );
  } catch (error: any) {
    console.error("[ENVIOCLICK_WEBHOOK] Error processing webhook:", error);
    return handleErrorResponse(error, "ENVIOCLICK_WEBHOOK", {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
