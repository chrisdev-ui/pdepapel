import { Button } from "@/components/ui/button";
import { WhatsappButton } from "@/components/whatsapp-button";
import { getInventoryIssueBadge, getOrderChannel, getPaymentBadge, getShippingBadge } from "@/lib/order-queues";
import { buildOrderTimeline, getNextStepCard, type TimelineOrder } from "@/lib/order-timeline";
import { cn, currencyFormatter } from "@/lib/utils";
import { Check, Clock, ExternalLink } from "lucide-react";
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

const TONE_BG: Record<string, string> = {
  cream: "bg-tint-cream border-[#F3E2A0]",
  sky: "bg-tint-sky border-[#B9DDF2]",
  pink: "bg-tint-pink border-[#F5C1DA]",
  mint: "bg-tint-mint border-[#B8E8C8]",
  lavender: "bg-tint-lavender border-[#D0C4F0]",
  slate: "bg-muted border-border",
};

const fmt = (value: Date | string) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date(value));

/** Cabecera, línea de tiempo y siguiente paso de la página del pedido. */
export function OrderWorkspaceHeader({ storeId, order }: OrderWorkspaceHeaderProps) {
  const channel = getOrderChannel(order.type);
  const payment = getPaymentBadge(order);
  const shipping = getShippingBadge(order);
  const inventoryIssue = getInventoryIssueBadge(order);
  const steps = buildOrderTimeline(order);
  const next = getNextStepCard(order, storeId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Pedido {order.orderNumber}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <TintBadge label={channel.label} tone={CHANNEL_TONE[channel.id]} />
            <TintBadge label={payment.label} tone={payment.tone} />
            {shipping && <TintBadge label={shipping.label} tone={shipping.tone} />}
            {inventoryIssue && (
              <a href="#zona-de-cuidado" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <TintBadge label={inventoryIssue.label} tone={inventoryIssue.tone} />
              </a>
            )}
            <span className="text-xs text-muted-foreground">
              {order.fullName} · {currencyFormatter(order.total)} · creado el {fmt(order.createdAt)}
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
              products: order.orderItems.map((item) => ({ name: item.name, sku: item.sku ?? "N/A", quantity: item.quantity })),
            }}
          />
          <Button asChild variant="outline" size="sm">
            <Link href={`/${storeId}/pedidos`}>Volver a pedidos</Link>
          </Button>
        </div>
      </div>

      <ol aria-label="Línea de tiempo del pedido" className="flex gap-2 overflow-x-auto rounded-xl border bg-white p-4">
        {steps.map((step, index) => (
          <li key={step.id} className="flex min-w-[120px] flex-1 flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  step.state === "done" && "bg-tint-mint text-primary",
                  step.state === "now" && "bg-primary text-primary-foreground",
                  step.state === "todo" && "bg-muted",
                  step.state === "skipped" && "bg-muted opacity-50",
                )}
                aria-hidden="true"
              >
                {step.state === "done" ? <Check className="h-3.5 w-3.5" /> : step.state === "now" ? <Clock className="h-3.5 w-3.5" /> : null}
              </span>
              {index < steps.length - 1 && <span className={cn("h-0.5 flex-1", step.state === "done" ? "bg-tint-mint" : "bg-border")} aria-hidden="true" />}
            </div>
            <span className={cn("text-[13px] font-semibold", step.state === "todo" || step.state === "skipped" ? "text-muted-foreground" : "text-primary")}>
              {step.label}
              <span className="sr-only">{step.state === "done" ? " (hecho)" : step.state === "now" ? " (en curso)" : ""}</span>
            </span>
            {step.meta && <span className="truncate text-xs text-muted-foreground" title={step.meta}>{step.meta}</span>}
          </li>
        ))}
      </ol>

      {next && (
        <section aria-labelledby="siguiente-paso" className={cn("flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between", TONE_BG[next.tone])}>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="siguiente-paso" className="text-[15px] font-bold text-primary">{next.title}</h2>
            <p className="text-sm text-primary/90">{next.description}</p>
            {next.consequence && <p className="text-xs text-primary/70">{next.consequence}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {next.secondary && (
              <Button asChild variant="outline" size="sm">
                <a href={next.secondary.href} target={next.secondary.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                  {next.secondary.label}
                </a>
              </Button>
            )}
            <Button asChild size="sm">
              {next.primary.href.startsWith("http") ? (
                <a href={next.primary.href} target="_blank" rel="noreferrer">
                  {next.primary.label}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ) : (
                <a href={next.primary.href}>{next.primary.label}</a>
              )}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
