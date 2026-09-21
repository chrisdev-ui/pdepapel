import Link from "next/link";

import { MetricCard } from "@/components/ui/metric-card";
import { SectionCard } from "@/components/ui/section-card";
import { TintBadge } from "@/components/ui/tint-badge";
import type { BusinessGrowthPeriodSelection } from "@/lib/business-growth-period";
import { currencyFormatter } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Coins, Package } from "lucide-react";

import { getShippingAnalytics } from "../server/get-shipping-analytics";

interface ShippingAnalyticsProps {
  storeId: string;
  period: BusinessGrowthPeriodSelection;
}

/** Ancho de la barra de reparto. Sin porcentaje no hay barra que pintar. */
function shareStyle(sharePct: number) {
  return { width: `${Math.max(sharePct, 1.5)}%` };
}

const TINT_BAR: Record<string, string> = {
  mint: "bg-tint-mint",
  sky: "bg-tint-sky",
  lavender: "bg-tint-lavender",
  pink: "bg-tint-pink",
  slate: "bg-muted-foreground/30",
};

export async function ShippingAnalytics({
  storeId,
  period,
}: ShippingAnalyticsProps) {
  const analytics = await getShippingAnalytics(storeId, period);

  const troubleHref = `/${storeId}/envios?vista=con-novedad`;
  const change = analytics.changeVsPreviousPct;

  if (analytics.allTimeShipments === 0) {
    return (
      <SectionCard
        id="envios-vacio"
        title="Todavía no hay envíos"
        description="Cuando despaches el primer pedido, aquí verás cuántos salieron, en qué punto están y cuánto te costó moverlos."
      >
        <Link
          href={`/${storeId}/envios`}
          className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          Ir a Envíos
        </Link>
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
        La pestaña ignoraba el mes por completo: elegías julio en las otras dos
        vistas, entrabas aquí y estabas viendo hoy, sin selector y sin aviso.
        Ahora respeta el período; esta línea lo deja por escrito para que nadie
        tenga que deducirlo de una tarjeta que se llamaba «Este Mes».
      */}
      <p className="text-sm text-muted-foreground">
        Envíos de <strong className="text-primary">{analytics.period.label}</strong>
        , el mismo mes que estás viendo en las otras vistas.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Envíos del mes"
          value={analytics.totalShipments.toString()}
          note={`${analytics.allTimeShipments.toLocaleString("es-CO")} desde que abriste`}
          icon={<Package className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-sky"
          valueAdornment={
            change === null ? undefined : (
              <TintBadge
                tone={change >= 0 ? "mint" : "pink"}
                label={`${change >= 0 ? "+" : "−"}${Math.abs(change)} %`}
                className="gap-1"
              />
            )
          }
        />
        <MetricCard
          label="Entregados"
          value={analytics.deliveredShipments.toString()}
          note={`${analytics.deliveryRate} % de los del mes`}
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-mint"
        />
        <MetricCard
          label="Con novedad"
          value={analytics.troubleShipments.toString()}
          note="Devueltos, fallidos o con incidencia"
          icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-pink"
          tone={analytics.troubleShipments > 0 ? "care" : "default"}
          action={
            analytics.troubleShipments > 0 ? (
              <Link
                href={troubleHref}
                className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
              >
                Resolverlas en Envíos
              </Link>
            ) : undefined
          }
        />
        <MetricCard
          label="Te costó enviar"
          value={currencyFormatter(analytics.totalShippingCost)}
          note={`${currencyFormatter(analytics.averageShippingCost)} por envío`}
          icon={<Coins className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-cream"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          id="envios-por-estado"
          title="En qué punto están"
          description={`Los ${analytics.totalShipments} envíos de ${analytics.period.label}, agrupados por estado.`}
          action={
            <Link
              href={`/${storeId}/envios`}
              className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              Abrir la lista
            </Link>
          }
        >
          {analytics.byStatusGroup.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No se despachó nada en {analytics.period.label}.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {analytics.byStatusGroup.map((group) => (
                <li key={group.id} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className="text-sm font-semibold text-primary"
                      title={group.detail}
                    >
                      {group.label}
                    </span>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {group.count}{" "}
                      <span className="tabular-nums">({group.sharePct} %)</span>
                    </span>
                  </div>
                  <div
                    className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
                    role="presentation"
                  >
                    <div
                      className={`h-full rounded-full ${TINT_BAR[group.tint] ?? "bg-muted-foreground/30"}`}
                      style={shareStyle(group.sharePct)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          id="envios-por-transportadora"
          title="Con quién estás enviando"
          description="Las que más movieron este mes y lo que te cobró cada una en promedio."
        >
          {analytics.topCarriers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ningún envío de {analytics.period.label} tiene transportadora
              asignada.
            </p>
          ) : (
            <ul className="flex flex-col">
              {analytics.topCarriers.map((carrier, index) => (
                <li
                  key={carrier.carrier}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2.5 last:border-0 last:pb-0"
                >
                  <span className="w-4 shrink-0 text-xs font-bold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">
                    {carrier.carrier}
                  </span>
                  <TintBadge
                    tone="sky"
                    label={`${carrier.count} ${carrier.count === 1 ? "envío" : "envíos"}`}
                  />
                  <span className="w-24 shrink-0 text-right text-sm font-semibold text-primary tabular-nums">
                    {carrier.averageCost === null
                      ? "—"
                      : currencyFormatter(carrier.averageCost)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
