"use client";

import { Button } from "@/components/ui/button";
import { useSensitiveDataStore } from "@/hooks/use-sensitive-data-store";
import type { TodaySummary } from "@/lib/dashboard-today";
import { cn, currencyFormatter } from "@/lib/utils";
import { AlertTriangle, Banknote, ChevronRight, CreditCard, Eye, EyeOff, PackageCheck } from "lucide-react";
import Link from "next/link";

interface TodayKpisProps {
  storeId: string;
  summary: TodaySummary;
}

const numberFormatter = new Intl.NumberFormat("es-CO");

function Kpi({
  title,
  value,
  note,
  href,
  linkLabel,
  icon,
  tint,
  sensitive,
}: {
  title: string;
  value: string;
  note: string;
  href: string;
  linkLabel: string;
  icon: React.ReactNode;
  tint: string;
  sensitive?: { id: string; visible: boolean; toggle: () => void };
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-muted-foreground">{title}</span>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-primary", tint)}>{icon}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[26px] font-bold leading-none tracking-tight text-primary">
          {sensitive && !sensitive.visible ? "••••••" : value}
        </span>
        {sensitive && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={sensitive.visible ? "Ocultar cifra" : "Mostrar cifra"}
            onClick={sensitive.toggle}
            className="text-muted-foreground"
          >
            {sensitive.visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{note}</span>
        <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary hover:underline">
          {linkLabel}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

export function TodayKpis({ storeId, summary }: TodayKpisProps) {
  const { cards, toggleVisibility } = useSensitiveDataStore();
  const visible = cards["today-net"]?.isVisible ?? true;
  const base = `/${storeId}`;
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
      <Kpi
        title="Ventas de hoy"
        value={currencyFormatter(summary.today.net)}
        note={
          summary.today.orders === 0 && summary.today.marketplaceNet === 0
            ? "Todavía sin ventas pagadas hoy"
            : `${summary.today.orders} ${summary.today.orders === 1 ? "pedido" : "pedidos"}${summary.today.marketplaceNet > 0 ? " · incluye Mercado Libre neto" : ""} · neto recibido`
        }
        href={`${base}/pedidos`}
        linkLabel="Ver pedidos"
        icon={<Banknote className="h-4 w-4" aria-hidden="true" />}
        tint="bg-tint-mint"
        sensitive={{ id: "today-net", visible, toggle: () => toggleVisibility("today-net") }}
      />
      <Kpi
        title="Por despachar"
        value={numberFormatter.format(summary.toDispatch)}
        note="Pagados sin guía · últimos 30 días"
        href={`${base}/pedidos?vista=por-despachar`}
        linkLabel="Crear guías"
        icon={<PackageCheck className="h-4 w-4" aria-hidden="true" />}
        tint="bg-tint-sky"
      />
      <Kpi
        title="Pagos por verificar"
        value={numberFormatter.format(summary.pendingPayments.count)}
        note={summary.pendingPayments.count ? `Transferencias de 14 días · ${visible ? currencyFormatter(summary.pendingPayments.amount) : "••••"}` : "Sin transferencias pendientes"}
        href={`${base}/pedidos?vista=por-verificar`}
        linkLabel="Verificar"
        icon={<CreditCard className="h-4 w-4" aria-hidden="true" />}
        tint="bg-tint-cream"
      />
      <Kpi
        title="Por reponer"
        value={numberFormatter.format(summary.lowStock.count)}
        note={`${summary.lowStock.runsOutThisWeek} se acaban esta semana · ${summary.lowStock.outOfStockSelling} agotados que vendían`}
        href={`${base}/inventario?vista=por-reponer`}
        linkLabel="Reponer"
        icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
        tint="bg-tint-pink"
      />
    </div>
  );
}
