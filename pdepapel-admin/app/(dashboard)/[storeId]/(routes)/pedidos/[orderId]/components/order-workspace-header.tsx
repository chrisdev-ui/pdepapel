import { Button } from "@/components/ui/button";
import { WhatsappButton } from "@/components/whatsapp-button";
import {
  getInventoryIssueBadge,
  getOrderChannel,
  getPaymentBadge,
  getShippingBadge,
} from "@/lib/order-queues";
import type { TimelineOrder } from "@/lib/order-timeline";
import { currencyFormatter } from "@/lib/utils";
import Link from "next/link";
import { CHANNEL_TONE, TintBadge } from "../../components/order-badges";

interface OrderWorkspaceHeaderProps {
  storeId: string;
  order: TimelineOrder & {
    id: string;
    orderNumber: string;
    fullName: string;
    phone: string;
    total: number;
    status: TimelineOrder["status"];
    orderItems: { name: string; sku?: string | null; quantity: number }[];
  };
}

const fmt = (value: Date | string) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(value));

/** Cabecera del pedido: número, insignias y accesos. La línea de tiempo vive en la barra de estado. */
export function OrderWorkspaceHeader({
  storeId,
  order,
}: OrderWorkspaceHeaderProps) {
  const channel = getOrderChannel(order.type);
  const payment = getPaymentBadge(order);
  const shipping = getShippingBadge(order);
  const inventoryIssue = getInventoryIssueBadge(order);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            Pedido {order.orderNumber}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <TintBadge label={channel.label} tone={CHANNEL_TONE[channel.id]} />
            <TintBadge label={payment.label} tone={payment.tone} />
            {shipping && (
              <TintBadge label={shipping.label} tone={shipping.tone} />
            )}
            {inventoryIssue && (
              <a
                href="#zona-de-cuidado"
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <TintBadge
                  label={inventoryIssue.label}
                  tone={inventoryIssue.tone}
                />
              </a>
            )}
            <span className="text-xs text-muted-foreground">
              {order.fullName} · {currencyFormatter(order.total)} · creado el{" "}
              {fmt(order.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WhatsappButton
            withText
            order={{
              orderNumber: order.orderNumber,
              status: order.status,
              fullName: order.fullName,
              phone: order.phone,
              totalPrice: currencyFormatter(order.total),
              products: order.orderItems.map((item) => ({
                name: item.name,
                sku: item.sku ?? "N/A",
                quantity: item.quantity,
              })),
            }}
          />
          <Button asChild variant="outline" size="sm">
            <Link href={`/${storeId}/pedidos`}>Volver a pedidos</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
