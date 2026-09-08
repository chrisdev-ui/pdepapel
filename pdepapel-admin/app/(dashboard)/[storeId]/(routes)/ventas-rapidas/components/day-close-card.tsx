import { Banknote, CreditCard, Landmark, Wallet } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  METHOD_LABELS,
  type PointOfSaleDayMethod,
  type PointOfSaleDaySummary,
} from "@/lib/point-of-sale-day";
import { currencyFormatter } from "@/lib/utils";

const TIME = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Bogota",
});

const METHOD_ICONS: Record<PointOfSaleDayMethod, typeof Banknote> = {
  cash: Banknote,
  transfer: Landmark,
  other: CreditCard,
};

const METHOD_ORDER: PointOfSaleDayMethod[] = ["cash", "transfer", "other"];

interface DayCloseCardProps {
  storeId: string;
  summary: PointOfSaleDaySummary;
}

/**
 * Cierre del día: lo vendido hoy en el punto de venta por método de pago.
 * Es una lectura del servidor; se refresca al registrar cada venta.
 */
export function DayCloseCard({ storeId, summary }: DayCloseCardProps) {
  const methods = METHOD_ORDER.filter(
    (method) => method !== "other" || summary.byMethod.other.count > 0,
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-primary" aria-hidden="true" />
          Cierre del día
        </CardTitle>
        <CardDescription>
          {summary.sales === 0
            ? "Aún no hay ventas presenciales hoy."
            : `${summary.sales} venta${summary.sales === 1 ? "" : "s"} · ${summary.units} unidad${summary.units === 1 ? "" : "es"}${summary.lastSaleAt ? ` · última a las ${TIME.format(summary.lastSaleAt)}` : ""}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2" aria-label="Total por método de pago">
          {methods.map((method) => {
            const Icon = METHOD_ICONS[method];
            const bucket = summary.byMethod[method];
            return (
              <li
                key={method}
                className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {METHOD_LABELS[method]}
                  <span className="text-xs text-muted-foreground">
                    · {bucket.count}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {currencyFormatter(bucket.total)}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Total del día</span>
          <span className="text-xl font-bold tabular-nums">{currencyFormatter(summary.total)}</span>
        </div>
        {summary.recent.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Últimas ventas
              </p>
              <ul className="divide-y text-sm">
                {summary.recent.map((sale) => (
                  <li key={sale.id} className="flex items-center justify-between gap-3 py-1.5">
                    <Link
                      href={`/${storeId}/pedidos/${sale.id}`}
                      className="min-w-0 truncate font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {sale.orderNumber}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {TIME.format(sale.paidAt)} · {METHOD_LABELS[sale.method]}
                    </span>
                    <span className="shrink-0 tabular-nums">{currencyFormatter(sale.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Las ventas presenciales quedan en{" "}
          <Link href={`/${storeId}/pedidos`} className="font-medium text-primary underline-offset-4 hover:underline">
            Pedidos
          </Link>{" "}
          con el tipo Presencial. Si te equivocaste, registra la devolución en Movimientos.
        </p>
      </CardContent>
    </Card>
  );
}
