import { OrderStatus, ShippingStatus } from "@prisma/client";

import type { GetOrderResult } from "../../server/get-order";
import { QuoteRequestsList } from "../quote-requests-list";
import { SectionCard } from "./section-card";

interface HistoryCardProps {
  order: NonNullable<GetOrderResult["order"]>;
}

const fmt = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }).format(date);
};

interface HistoryEvent {
  at: Date;
  label: string;
  detail?: string;
}

/** Lo que consta en el pedido con fecha: creación, pago, guía, entrega, cancelación. */
function buildEvents(order: HistoryCardProps["order"]): HistoryEvent[] {
  const raw = order as typeof order & { viewedAt?: Date | string | null; acceptedAt?: Date | string | null };
  const events: HistoryEvent[] = [{ at: new Date(order.createdAt), label: "Pedido creado", detail: order.orderNumber }];
  if (raw.viewedAt) events.push({ at: new Date(raw.viewedAt), label: "Cotización vista por el cliente" });
  if (raw.acceptedAt) events.push({ at: new Date(raw.acceptedAt), label: "Cotización aceptada" });
  if (order.paidAt) {
    events.push({
      at: new Date(order.paidAt),
      label: "Pago registrado",
      detail: order.payment?.transactionId ? `Ref. ${order.payment.transactionId}` : order.payment?.method ? String(order.payment.method) : undefined,
    });
  }
  const shipping = order.shipping;
  if (shipping?.trackingCode) {
    events.push({
      at: new Date(shipping.pickupDate ?? shipping.updatedAt ?? shipping.createdAt),
      label: "Guía creada",
      detail: [shipping.carrierName ?? shipping.courier, shipping.trackingCode].filter(Boolean).join(" · "),
    });
  }
  if (shipping?.status === ShippingStatus.Delivered && shipping.actualDeliveryDate) {
    events.push({ at: new Date(shipping.actualDeliveryDate), label: "Entregado" });
  }
  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REJECTED) {
    events.push({ at: new Date(order.updatedAt), label: order.status === OrderStatus.CANCELLED ? "Pedido cancelado" : "Cotización rechazada" });
  }
  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function HistoryCard({ order }: HistoryCardProps) {
  const events = buildEvents(order);
  const requests = (order as typeof order & { quoteRequests?: Parameters<typeof QuoteRequestsList>[0]["requests"] }).quoteRequests;
  return (
    <SectionCard id="historial" title="Historial" description="Fechas que constan en el pedido.">
      <ol className="flex flex-col gap-2.5">
        {events.map((event, index) => (
          <li key={`${event.label}-${index}`} className="flex gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" aria-hidden="true" />
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold text-primary">{event.label}</span>
              <span className="text-xs text-muted-foreground">
                {fmt(event.at)}
                {event.detail ? ` · ${event.detail}` : ""}
              </span>
            </div>
          </li>
        ))}
      </ol>
      {requests && requests.length > 0 && <QuoteRequestsList requests={requests} />}
    </SectionCard>
  );
}
