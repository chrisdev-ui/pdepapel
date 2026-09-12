import { ShippingStatus } from "@prisma/client";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatShortDate, getShipmentStatusBadge, getStaleInTransitBadge } from "@/lib/shipment-views";
import { currencyFormatter } from "@/lib/utils";

import { TintBadge } from "../../pedidos/components/order-badges";
import { relativeDate } from "../../pedidos/components/columns";
import { CellAction } from "./cell-action";
import { carrierLabel, PROVIDER_LABELS, type ShipmentColumn } from "./columns";

/** Enlace directo a la guía PDF o, en su defecto, al rastreo de la transportadora. */
export function getShipmentDirectLink(shipment: Pick<ShipmentColumn, "guideUrl" | "trackingUrl">): { href: string; label: string } | null {
  if (shipment.guideUrl) return { href: shipment.guideUrl, label: "Ver guía" };
  if (shipment.trackingUrl) return { href: shipment.trackingUrl, label: "Rastrear" };
  return null;
}

export function ShipmentMobileCard({ shipment, storeId }: { shipment: ShipmentColumn; storeId: string }) {
  const badge = getShipmentStatusBadge(shipment.status);
  const stale = getStaleInTransitBadge(shipment);
  const order = shipment.order;
  const carrier = carrierLabel(shipment);
  const arrival = formatShortDate(shipment.estimatedDeliveryDate);
  const link = getShipmentDirectLink(shipment);
  return (
    <article className="flex min-w-0 flex-col gap-2.5 rounded-xl border bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          {order ? (
            <Link href={`/${storeId}/pedidos/${order.id}#envio`} className="truncate text-sm font-bold text-primary">
              {order.orderNumber}
            </Link>
          ) : (
            <span className="text-sm font-bold text-muted-foreground">Sin pedido</span>
          )}
          <span className="truncate text-sm">
            {order?.fullName}
            {order?.city ? ` · ${order.city}` : ""}
          </span>
        </div>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <TintBadge label={badge.label} tone={badge.tone} />
          {stale && <TintBadge label={stale.label} tone={stale.tone} />}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{carrier ? `${carrier} · ${PROVIDER_LABELS[shipment.provider]}` : "Sin transportadora"}</span>
        {shipment.trackingCode && <span className="font-mono">{shipment.trackingCode}</span>}
        <span className="ml-auto whitespace-nowrap">{relativeDate(shipment.updatedAt)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <dt className="text-muted-foreground">Llega</dt>
          <dd className="truncate font-medium">{arrival ?? "—"}</dd>
        </div>
        <div className="flex min-w-0 items-baseline gap-1.5">
          <dt className="text-muted-foreground">Costo</dt>
          <dd className="truncate font-medium">{shipment.cost ? currencyFormatter(shipment.cost) : "—"}</dd>
        </div>
      </dl>
      <div className="flex items-center gap-2">
        {order && (
          <Button asChild variant="soft" className="min-w-0 flex-1">
            <Link href={`/${storeId}/pedidos/${order.id}#envio`}>
              {shipment.status === ShippingStatus.Preparing ? "Preparar envío" : "Ver envío"}
            </Link>
          </Button>
        )}
        {link && (
          <Button asChild variant="outline" size="sm">
            <a href={link.href} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {link.label}
            </a>
          </Button>
        )}
        <CellAction data={shipment} />
      </div>
    </article>
  );
}
