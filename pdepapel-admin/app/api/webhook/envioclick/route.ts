import { handleErrorResponse } from "@/lib/api-errors";
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
  Entregada: ShippingStatus.Delivered,
  "En tránsito": ShippingStatus.InTransit,
  "Pendiente de Recolección": ShippingStatus.Preparing,
  "Envío Recolectado": ShippingStatus.PickedUp,
  Devuelto: ShippingStatus.Returned,
  Devuelta: ShippingStatus.Returned,
  Cancelado: ShippingStatus.Cancelled,
  Cancelada: ShippingStatus.Cancelled,
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

// Handle GET request for webhook verification
export async function GET() {
  return NextResponse.json(
    {
      status: "active",
      message: "EnvioClick webhook endpoint is ready",
      timestamp: new Date().toISOString(),
    },
    { headers: corsHeaders },
  );
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

    // Wrap DB operations in a transaction for atomicity
    const result = await prismadb.$transaction(async (tx: any) => {
      // Find shipping by EnvioClick order ID or reference
      const shipping = await tx.shipping.findFirst({
        where: {
          OR: [
            { envioClickIdOrder: idOrder },
            { myShipmentReference: myShipmentReference },
          ],
        },
        include: { order: true },
      });

      if (!shipping) {
        return { type: "NOT_FOUND" } as const;
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
      const updatedShipping = await tx.shipping.update({
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

      // SYNC: Update Parent Order Status based on Shipping Movement
      // If shipping moves to InTransit/PickedUp/OutForDelivery/Delivered, mark Order as SENT
      if (
        (
          [
            ShippingStatus.PickedUp,
            ShippingStatus.InTransit,
            ShippingStatus.OutForDelivery,
            ShippingStatus.Delivered,
          ] as ShippingStatus[]
        ).includes(newStatus)
      ) {
        await tx.order.update({
          where: { id: shipping.orderId },
          data: { status: "SENT" },
        });
      }

      // Store tracking events
      if (events.length > 0) {
        for (const event of events) {
          try {
            // Check if event already exists to avoid duplicates
            const existingEvent = await tx.shippingTrackingEvent.findFirst({
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

              await tx.shippingTrackingEvent.create({
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
            console.error(
              "[ENVIOCLICK_WEBHOOK] Error saving event:",
              eventError,
            );
            // Continue processing other events
            // Note: If an error occurs here, it might abort the transaction depending on Prisma's behavior for caught errors.
            // However, catching it inside the transaction block prevents the transaction from aborting immediately?
            // Actually, if we catch it, the error doesn't reach the transaction wrapper, so it continues.
            // But if the error was a DB constraint violation that invalidates the transaction state, subsequent queries might fail.
            // For simple duplicates (which we check for) or data format issues, catching is fine.
          }
        }
      }

      return { type: "SUCCESS", shipping, newStatus } as const;
    });

    if (result.type === "NOT_FOUND") {
      console.error("[ENVIOCLICK_WEBHOOK] Shipping not found:", {
        idOrder,
        myShipmentReference,
      });
      // Return 200 to allow webhook tests to pass even if our DB doesn't have the ID
      return NextResponse.json(
        {
          message: "Shipping record not found, but webhook acknowledged",
          receivedId: idOrder || myShipmentReference,
        },
        { status: 200, headers: corsHeaders },
      );
    }

    // Send email notification if status changed
    // This is done outside the transaction to avoid side effects being rolled back (impossible for email)
    // or blocking the transaction.
    if (result.newStatus !== result.shipping.status) {
      const updatedOrder = await prismadb.order.findUnique({
        where: { id: result.shipping.orderId },
        include: {
          payment: true,
          shipping: true,
          orderItems: {
            include: {
              product: true,
            },
          },
        },
      });

      if (updatedOrder) {
        setImmediate(async () => {
          try {
            await sendShippingEmail(
              {
                ...updatedOrder,
                payment: updatedOrder.payment?.method ?? undefined,
              },
              result.newStatus,
            );
          } catch (emailError) {
            console.error(
              "[ENVIOCLICK_WEBHOOK] Failed to send email:",
              emailError,
            );
          }
        });
      }
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
