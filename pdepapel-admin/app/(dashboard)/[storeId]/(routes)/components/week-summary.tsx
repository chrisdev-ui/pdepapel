"use client";

import { useSensitiveDataStore } from "@/hooks/use-sensitive-data-store";
import type { TodaySummary } from "@/lib/dashboard-today";
import { cn, currencyFormatter } from "@/lib/utils";

const CHANNEL_DOT: Record<string, string> = {
  tienda: "bg-kawaii-baby",
  mercadolibre: "bg-kawaii-star",
  presencial: "bg-kawaii-shell",
  feria: "bg-kawaii-purple",
};

export function WeekSummary({ week }: { week: TodaySummary["week"] }) {
  const { cards } = useSensitiveDataStore();
  const visible = cards["today-net"]?.isVisible ?? true;
  const max = Math.max(...week.days.map((d) => d.net), 1);
  const money = (value: number) => (visible ? currencyFormatter(value) : "••••••");
  return (
    <section aria-labelledby="semana" className="flex flex-col gap-3.5 rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 id="semana" className="text-[15px] font-bold text-primary">Esta semana</h2>
        {week.change !== null && (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold text-primary", week.change >= 0 ? "bg-tint-mint" : "bg-tint-pink")}>
            {week.change >= 0 ? "+" : ""}
            {week.change} % vs. anterior
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-primary">{money(week.net)}</span>
        <span className="text-xs text-muted-foreground">neto · {week.orders} {week.orders === 1 ? "pedido" : "pedidos"}</span>
      </div>
      <div className="flex h-24 items-end gap-2" role="img" aria-label={`Ventas netas por día de la última semana: ${week.days.map((d) => `${d.label} ${currencyFormatter(d.net)}`).join(", ")}`}>
        {week.days.map((day, index) => (
          <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <div
              className={cn("w-full rounded-t-md", index === week.days.length - 1 ? "bg-kawaii-shell" : "bg-kawaii-baby")}
              style={{ height: `${Math.max(4, Math.round((day.net / max) * 100))}%` }}
              title={`${day.label}: ${currencyFormatter(day.net)}`}
            />
            <span className="text-[11px] font-semibold text-muted-foreground">{day.label}</span>
          </div>
        ))}
      </div>
      <ul className="flex flex-col gap-2 border-t pt-3 text-[13px]">
        {week.channels.map((channel) => (
          <li key={channel.channel} className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", CHANNEL_DOT[channel.channel])} aria-hidden="true" />
            <span className="flex-1">{channel.label}</span>
            <span className="font-semibold">{money(channel.net)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
