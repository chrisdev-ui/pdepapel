import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getShipmentStatusBadge } from "@/lib/shipment-views";

import { TintBadge } from "../../pedidos/components/order-badges";
import { relativeDate } from "../../pedidos/components/columns";
import { CellAction } from "./cell-action";
import { carrierLabel, PROVIDER_LABELS, type ShipmentColumn } from "./columns";

export function ShipmentMobileCard({ shipment, storeId }: { shipment: ShipmentColumn; storeId: string }) {
  const badge = getShipmentStatusBadge(shipment.status);
  const order = shipment.order;
  const carrier = carrierLabel(shipment);
  return (
    <article className="flex flex-col gap-2.5 rounded-xl border bg-white p-3.5 shadow-sm">
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
        <TintBadge label={badge.label} tone={badge.tone} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{carrier ? `${carrier} · ${PROVIDER_LABELS[shipment.provider]}` : "Sin transportadora"}</span>
        {shipment.trackingCode && <span className="font-mono">{shipment.trackingCode}</span>}
        <span className="ml-auto">{relativeDate(shipment.updatedAt)}</span>
      </div>
      <div className="flex items-center gap-2">
        {order && (
          <Button asChild variant="soft" className="flex-1">
            <Link href={`/${storeId}/pedidos/${order.id}#envio`}>
              {shipment.status === "Preparing" ? "Preparar envío" : "Ver envío"}
            </Link>
          </Button>
        )}
        <CellAction data={shipment} />
      </div>
    </article>
  );
}
