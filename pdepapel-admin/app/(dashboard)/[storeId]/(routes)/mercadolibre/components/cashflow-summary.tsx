"use client";

import { MercadoLibreLogo } from "@/components/mercadolibre-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CalendarClock,
  CircleAlert,
  ExternalLink,
  Landmark,
  Loader2,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { useCallback, useState } from "react";

type MercadoLibreCashflowSummary = {
  accountBalance:
    | {
        state: "AVAILABLE";
        availableBalance: number;
        totalAmount: number | null;
        unavailableBalance: number | null;
      }
    | {
        state: "UNAVAILABLE";
        reason: "UNSUPPORTED" | "TEMPORARY" | "INVALID_RESPONSE";
      };
  awaitingRelease: { amount: number; orders: number };
  settlementPending: { orders: number };
  releaseStatusUnknown: { orders: number };
  upcomingReleases: {
    marketplaceOrderId: string;
    externalOrderId: string;
    netAmount: number;
    paidAt: string | null;
    releaseDate: string;
  }[];
  updatedAt: string;
};

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

function formatCurrency(value: number | null) {
  return value === null ? "—" : currencyFormatter.format(value);
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function getErrorMessage(response: Response) {
  return response
    .json()
    .then(
      (body: { error?: string }) =>
        body.error ?? "No fue posible consultar el dinero de Mercado Libre",
    )
    .catch(() => "No fue posible consultar el dinero de Mercado Libre");
}

function SummaryMetric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "success" | "warning";
}) {
  const valueClassName =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-amber-700"
        : "text-foreground";

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${valueClassName}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function MercadoLibreCashflowSummary({ storeId }: { storeId: string }) {
  const [summary, setSummary] = useState<MercadoLibreCashflowSummary | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/cashflow`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setSummary((await response.json()) as MercadoLibreCashflowSummary);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No fue posible consultar el dinero de Mercado Libre",
      );
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  const accountBalance = summary?.accountBalance;
  const balanceIsAvailable = accountBalance?.state === "AVAILABLE";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <MercadoLibreLogo variant="mark" className="h-5 w-5" />
              Dinero de Mercado Libre
            </CardTitle>
            <CardDescription>
              Consulta manualmente el saldo y las fechas de liberación. P de
              Papel no mueve dinero ni guarda cuentas bancarias.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadSummary()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {summary ? "Actualizar saldo" : "Consultar dinero"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        {isLoading && !summary ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-lg border bg-muted/40"
              />
            ))}
          </div>
        ) : summary ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryMetric
                label="Saldo disponible"
                value={
                  balanceIsAvailable
                    ? formatCurrency(accountBalance.availableBalance)
                    : "Sin dato"
                }
                detail={
                  balanceIsAvailable
                    ? "Saldo actual informado por Mercado Pago."
                    : "Mercado Pago no devolvió el saldo para esta conexión."
                }
                tone={balanceIsAvailable ? "success" : "warning"}
              />
              <SummaryMetric
                label="Saldo retenido"
                value={
                  balanceIsAvailable
                    ? formatCurrency(accountBalance.unavailableBalance)
                    : "—"
                }
                detail="Valor retenido o aún no disponible según Mercado Pago."
                tone="warning"
              />
              <SummaryMetric
                label="Por liberar"
                value={formatCurrency(summary.awaitingRelease.amount)}
                detail={`${summary.awaitingRelease.orders} ${summary.awaitingRelease.orders === 1 ? "venta espera" : "ventas esperan"} su liberación.`}
                tone="warning"
              />
              <SummaryMetric
                label="Liquidación pendiente"
                value={String(summary.settlementPending.orders)}
                detail="Ventas pagadas cuyo neto aún no publicó Mercado Libre."
                tone={summary.settlementPending.orders ? "warning" : "default"}
              />
            </div>

            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    Retiro protegido en Mercado Pago
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Revisa el saldo, elige la cuenta bancaria y confirma el
                    retiro directamente en Mercado Pago.
                  </p>
                </div>
              </div>
              <Button asChild className="shrink-0">
                <a
                  href="https://www.mercadopago.com.co/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir Mercado Pago para retirar
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Próximas liberaciones</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Fechas informadas por Mercado Libre para ventas ya
                    liquidadas. La disponibilidad final depende de Mercado Pago
                    y de posibles reclamos.
                  </p>
                </div>
              </div>

              {summary.upcomingReleases.length ? (
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {summary.upcomingReleases.map((release) => (
                    <div
                      key={release.marketplaceOrderId}
                      className="rounded-md bg-muted/50 p-3 text-sm"
                    >
                      <p className="font-medium">
                        Venta {release.externalOrderId}
                      </p>
                      <p className="mt-1 text-success">
                        {formatCurrency(release.netAmount)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Fecha informada: {formatDate(release.releaseDate)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No hay ventas con una próxima fecha de liberación registrada.
                </p>
              )}

              {summary.awaitingRelease.orders >
              summary.upcomingReleases.length ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {summary.awaitingRelease.orders -
                    summary.upcomingReleases.length}{" "}
                  {summary.awaitingRelease.orders -
                    summary.upcomingReleases.length ===
                  1
                    ? "venta por liberar no tiene una fecha futura informada"
                    : "ventas por liberar no tienen una fecha futura informada"}
                  . Confírmalas en Mercado Pago antes de contarlas como saldo
                  disponible.
                </p>
              ) : null}

              {summary.releaseStatusUnknown.orders ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {summary.releaseStatusUnknown.orders}{" "}
                  {summary.releaseStatusUnknown.orders === 1
                    ? "venta histórica no tiene"
                    : "ventas históricas no tienen"}{" "}
                  fecha de liberación registrada. Revísalas en Mercado Pago
                  antes de considerarlas disponibles.
                </p>
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground">
              Última consulta: {formatDate(summary.updatedAt)}. El saldo de
              Mercado Pago puede incluir movimientos distintos a las ventas
              registradas en P de Papel.
            </p>
          </>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <WalletCards className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  Consulta el dinero cuando lo necesites
                </p>
                <p>
                  Pulsa <strong>Consultar dinero</strong> para ver el saldo que
                  Mercado Pago informa, las ventas por liberar y las que aún
                  esperan liquidación. La consulta no mueve dinero ni crea
                  retiros.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
