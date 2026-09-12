import { handleErrorResponse } from "@/lib/api-errors";
import { sendShippingEmail } from "@/lib/email";
import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { applyShipmentStatus, mapEnvioClickStatus } from "@/lib/shipment-status";
import {
  InvalidWebhookPayloadError,
  parseProviderDate,
  readWebhookStoreId,
  readWebhookToken,
  safeSecretEquals,
} from "@/lib/webhook-auth";
import { NextResponse } from "next/server";

/**
 * EnvioClick no firma sus webhooks, así que la URL configurada en su panel
 * lleva un secreto compartido (`?token=`, o la cabecera `x-webhook-token`) y,
 * opcionalmente, la tienda (`?store=`) a la que se limita la búsqueda.
 * Sin secreto válido esta ruta no toca nada: antes cualquiera podía marcar
 * un envío como entregado, reescribir la guía y avisar al cliente.
 */

// Este webhook lo llama EnvioClick servidor a servidor: no hay navegador que
// necesite CORS, y abrirlo a "*" solo facilitaba probarlo desde cualquier web.
const corsHeaders = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Webhook-Token",
};


// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Verificación de EnvioClick: solo confirma el endpoint a quien trae el secreto.
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: "No autorizado" },
      { status: 401, headers: corsHeaders },
    );
  }
  return NextResponse.json(
    { status: "active", timestamp: new Date().toISOString() },
    { headers: corsHeaders },
  );
}

function isAuthorized(req: Request): boolean {
  return safeSecretEquals(readWebhookToken(req), env.ENVIOCLICK_WEBHOOK_SECRET);
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    console.warn(
      "[ENVIOCLICK_WEBHOOK] Petición rechazada: secreto inválido o ausente",
    );
    return NextResponse.json(
      { error: "No autorizado" },
      { status: 401, headers: corsHeaders },
    );
  }

  try {
    const payload = await req.json().catch(() => {
      throw new InvalidWebhookPayloadError(
        "El cuerpo del webhook no es JSON válido",
      );
    });
    const scopedStoreId = readWebhookStoreId(req);

    console.log("[ENVIOCLICK_WEBHOOK] Payload recibido:", {
      idOrder: payload?.idOrder,
      myShipmentReference: payload?.myShipmentReference,
      events: Array.isArray(payload?.events) ? payload.events.length : 0,
      storeId: scopedStoreId,
    });

    // EnvioClick sends data directly in the body, not nested in "data"
    const {
      idOrder,
      myShipmentReference,
      trackingCode,
      realPickupDate,
      arrivalDate,
      realDeliveryDate,
      events = [],
    } = payload ?? {};

    if (idOrder === undefined && !myShipmentReference) {
      throw new InvalidWebhookPayloadError(
        "El webhook no trae idOrder ni myShipmentReference",
      );
    }
    if (!Array.isArray(events)) {
      throw new InvalidWebhookPayloadError("«events» debe ser una lista");
    }

    // Se validan antes de abrir la transacción: una fecha corrupta ya no
    // llega a Prisma como Invalid Date ni provoca un 500 con reintentos.
    const pickupDate = parseProviderDate(realPickupDate, "realPickupDate");
    const estimatedDeliveryDate = parseProviderDate(arrivalDate, "arrivalDate");
    const actualDeliveryDate = parseProviderDate(
      realDeliveryDate,
      "realDeliveryDate",
    );

    // Wrap DB operations in a transaction for atomicity
    const result = await prismadb.$transaction(async (tx: any) => {
      // Find shipping by EnvioClick order ID or reference
      const identifiers = [
        ...(idOrder === undefined || idOrder === null
          ? []
          : [{ envioClickIdOrder: Number(idOrder) }]),
        ...(myShipmentReference
          ? [{ myShipmentReference: String(myShipmentReference) }]
          : []),
      ];

      const shipping = await tx.shipping.findFirst({
        where: {
          ...(scopedStoreId ? { storeId: scopedStoreId } : {}),
          OR: identifiers,
        },
        include: { order: true },
      });

      if (!shipping) {
        return { type: "NOT_FOUND" } as const;
      }

      // Get the latest status from events (most recent first)
      const latestEvent = events.length > 0 ? events[0] : null;
      const newStatus = latestEvent
        ? mapEnvioClickStatus(latestEvent.statusStep ?? latestEvent.status, shipping.status)
        : shipping.status;

      console.log("[ENVIOCLICK_WEBHOOK] Processing update:", {
        shippingId: shipping.id,
        oldStatus: shipping.status,
        newStatus,
        statusStep: latestEvent?.statusStep,
        eventsCount: events.length,
      });

      // Update shipping record
      // `notes` son del equipo: quien recibió el paquete queda en el evento de
      // seguimiento, que es donde el cliente lo lee. Antes cada webhook de
      // entrega borraba lo que hubiera escrito la administradora.
      // El pedido sigue al envío (a «Enviado» cuando arranca) solo si la
      // transición está permitida: un evento tardío no revive un cancelado.
      await applyShipmentStatus(tx, {
        shippingId: shipping.id,
        storeId: shipping.storeId,
        status: newStatus,
        touch: true,
        extra: {
          trackingCode: trackingCode ? String(trackingCode) : shipping.trackingCode,
          pickupDate: pickupDate ?? shipping.pickupDate,
          estimatedDeliveryDate: estimatedDeliveryDate ?? shipping.estimatedDeliveryDate,
          actualDeliveryDate: actualDeliveryDate ?? shipping.actualDeliveryDate,
        },
      });

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
      // Antes se respondía 200 y el evento se perdía. Sigue siendo 200 (EnvioClick
      // no debe reintentar contra un envío que no tenemos), pero el aviso queda
      // guardado para que alguien lo revise.
      try {
        await prismadb.shippingWebhookEvent.create({
          data: {
            storeId: scopedStoreId ?? null,
            idOrder:
              idOrder === undefined || idOrder === null
                ? null
                : String(idOrder),
            myShipmentReference: myShipmentReference
              ? String(myShipmentReference)
              : null,
            payload,
            reason: "shipping_not_found",
          },
        });
      } catch (error) {
        console.error(
          "[ENVIOCLICK_WEBHOOK] No se pudo guardar el aviso huérfano:",
          error,
        );
      }
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
    if (error instanceof InvalidWebhookPayloadError) {
      console.warn("[ENVIOCLICK_WEBHOOK] Payload inválido:", error.message);
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: corsHeaders },
      );
    }
    console.error("[ENVIOCLICK_WEBHOOK] Error processing webhook:", error);
    return handleErrorResponse(error, "ENVIOCLICK_WEBHOOK", {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
