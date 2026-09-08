import { Button } from "@/components/ui/button";
import { getNextStep, getOrderChannel, getOrderQueue, getPaymentBadge, getShippingBadge } from "@/lib/order-queues";
import { currencyFormatter } from "@/lib/utils";
import Link from "next/link";
import { CellAction } from "./cell-action";
import { OrderColumn, relativeDate } from "./columns";
import { CHANNEL_TONE, TintBadge } from "./order-badges";

export function OrderMobileCard({ order, storeId }: { order: OrderColumn; storeId: string }) {
  const channel = getOrderChannel(order.type);
  const payment = getPaymentBadge(order);
  const shipping = getShippingBadge(order);
  const step = getNextStep(getOrderQueue(order));
  return (
    <article className="flex flex-col gap-2.5 rounded-xl border bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link href={`/${storeId}/pedidos/${order.id}`} className="truncate text-sm font-bold text-primary">
            {order.orderNumber}
          </Link>
          <span className="truncate text-sm">
            {order.fullName}
            {order.city ? ` · ${order.city}` : ""}
          </span>
        </div>
        <span className="whitespace-nowrap text-base font-bold text-primary">{currencyFormatter(order.total)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <TintBadge label={channel.label} tone={CHANNEL_TONE[channel.id]} />
        <TintBadge label={payment.label} tone={payment.tone} />
        {shipping && <TintBadge label={shipping.label} tone={shipping.tone} />}
        <span className="ml-auto text-xs text-muted-foreground">{relativeDate(order.createdAt)}</span>
      </div>
      <div className="flex items-center gap-2">
        {step && (
          <Button asChild variant={step.primary ? "default" : "soft"} className="flex-1">
            <Link href={`/${storeId}/pedidos/${order.id}`}>{step.label}</Link>
          </Button>
        )}
        <CellAction data={order} />
      </div>
    </article>
  );
}
