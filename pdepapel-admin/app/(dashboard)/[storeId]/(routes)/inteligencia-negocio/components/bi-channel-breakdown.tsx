import { Globe, PartyPopper, ShoppingBag, Store } from "lucide-react";

import { MetricCard } from "@/components/ui/metric-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { ChannelSummary, SalesChannel } from "@/actions/get-financial-analytics";
import { currencyFormatter } from "@/lib/utils";

const ICONS: Record<SalesChannel, typeof Globe> = {
  online: Globe,
  point_of_sale: Store,
  fair: PartyPopper,
  marketplace: ShoppingBag,
};

const TINTS: Record<SalesChannel, string> = {
  online: "bg-tint-sky",
  point_of_sale: "bg-tint-mint",
  fair: "bg-tint-lavender",
  marketplace: "bg-tint-cream",
};

/**
 * De dónde viene la plata del mes: los cuatro canales suman el total.
 *
 * Un canal en cero no es un error: hoy casi todo entra por la tienda en línea
 * y las ferias todavía no han vendido nada, así que la tarjeta lo dice con
 * palabras en vez de dejar un `$ 0` suelto que parece una pantalla rota.
 */
export function BiChannelBreakdown({
  channels,
  totalRevenue,
}: {
  channels: ChannelSummary[];
  totalRevenue: number;
}) {
  const used = channels.filter((channel) => channel.orders > 0).length;

  return (
    <section aria-labelledby="canales-titulo" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="canales-titulo" className="text-base font-semibold text-primary">
          De dónde viene la plata
        </h3>
        <p className="text-sm text-muted-foreground">
          {used === 0
            ? "Todavía no hay ventas este mes."
            : used === 1
              ? "Este mes solo vendiste por un canal; los demás aparecen en cero hasta que registres una venta ahí."
              : `Los cuatro canales suman ${currencyFormatter(totalRevenue)}.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {channels.map((channel) => {
          const Icon = ICONS[channel.channel];
          const idle = channel.orders === 0;
          return (
            <MetricCard
              key={channel.channel}
              label={channel.label}
              value={currencyFormatter(channel.revenue)}
              note={
                idle
                  ? "Sin ventas este mes"
                  : `${channel.orders} ${channel.orders === 1 ? "pedido" : "pedidos"} · ${channel.share.toFixed(0)} % del total`
              }
              icon={<Icon className="h-4 w-4" aria-hidden="true" />}
              tint={TINTS[channel.channel]}
            />
          );
        })}
      </div>

      {totalRevenue > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border bg-white p-4 shadow-sm">
          {channels
            .filter((channel) => channel.revenue > 0)
            .map((channel) => (
              <div key={channel.channel} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-sm text-muted-foreground">
                  {channel.label}
                </span>
                <ProgressBar
                  percent={channel.share}
                  barClassName="bg-primary/60"
                  className="flex-1"
                />
                <span className="w-14 shrink-0 text-right text-sm tabular-nums text-primary">
                  {channel.share.toFixed(0)} %
                </span>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
