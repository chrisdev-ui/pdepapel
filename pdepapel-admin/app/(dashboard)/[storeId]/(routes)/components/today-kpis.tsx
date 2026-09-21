"use client";

import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { useSensitiveDataStore } from "@/hooks/use-sensitive-data-store";
import type { TodaySummary } from "@/lib/dashboard-today";
import { currencyFormatter } from "@/lib/utils";
import {
  AlertTriangle,
  Banknote,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  PackageCheck,
} from "lucide-react";
import Link from "next/link";

interface TodayKpisProps {
  storeId: string;
  summary: TodaySummary;
}

const numberFormatter = new Intl.NumberFormat("es-CO");

/**
 * Las cuatro cifras de Inicio, sobre la tarjeta compartida del panel.
 *
 * Antes eran una tarjeta propia, casi calcada de `MetricCard`: mismo borde,
 * mismo icono con su tinte, misma nota. Lo único que `MetricCard` no tenía era
 * el ojo que tapa la cifra y el enlace de abajo; ahora lo tiene, y hay una
 * sola tarjeta de cifra en todo el panel.
 */
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
    <MetricCard
      label={title}
      value={sensitive && !sensitive.visible ? "••••••" : value}
      note={note}
      icon={icon}
      tint={tint}
      valueAdornment={
        sensitive ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={sensitive.visible ? "Ocultar cifra" : "Mostrar cifra"}
            onClick={sensitive.toggle}
            className="shrink-0 text-muted-foreground"
          >
            {sensitive.visible ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        ) : undefined
      }
      action={
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary hover:underline"
        >
          {linkLabel}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    />
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
        sensitive={{
          id: "today-net",
          visible,
          toggle: () => toggleVisibility("today-net"),
        }}
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
        note={
          summary.pendingPayments.count
            ? `Transferencias de 14 días · ${visible ? currencyFormatter(summary.pendingPayments.amount) : "••••"}`
            : "Sin transferencias pendientes"
        }
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
