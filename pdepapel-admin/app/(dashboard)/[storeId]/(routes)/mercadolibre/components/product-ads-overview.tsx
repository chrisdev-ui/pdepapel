"use client";

import { MercadoLibreLogo } from "@/components/mercadolibre-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  BarChart3,
  ExternalLink,
  Loader2,
  Megaphone,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

type ProductAdsMetrics = {
  clicks: number;
  prints: number;
  cost: number;
  cpc: number | null;
  ctr: number | null;
  acos: number | null;
  roas: number | null;
  cvr: number | null;
  totalAmount: number;
  unitsQuantity: number;
};

type ProductAdsOverview =
  | {
      state: "READY";
      advertiser: { id: string; name: string | null };
      range: { from: string; to: string };
      currencyId: string;
      totalCampaigns: number;
      campaigns: Array<{
        id: string;
        name: string;
        status: string | null;
        budget: number | null;
        dailyBudget: number | null;
        metrics: ProductAdsMetrics;
      }>;
      summary: ProductAdsMetrics;
    }
  | {
      state: "NOT_ENABLED" | "REAUTH_REQUIRED";
      message: string;
    };

const campaignStatusLabels: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  ACTIVE: { label: "Activa", variant: "default" },
  PAUSED: { label: "Pausada", variant: "secondary" },
  CLOSED: { label: "Finalizada", variant: "outline" },
};

function getErrorMessage(response: Response) {
  return response
    .json()
    .then(
      (body: { error?: string }) =>
        body.error ?? "No fue posible consultar Product Ads",
    )
    .catch(() => "No fue posible consultar Product Ads");
}

function formatCurrency(value: number, currencyId: string) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: currencyId,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function formatRatio(value: number | null) {
  return value === null ? "—" : `${value.toFixed(2)}x`;
}

function getCampaignStatus(status: string | null) {
  if (!status) return { label: "Sin estado", variant: "outline" as const };

  return (
    campaignStatusLabels[status.toUpperCase()] ?? {
      label: status,
      variant: "outline" as const,
    }
  );
}

export function MercadoLibreProductAdsOverview({
  storeId,
}: {
  storeId: string;
}) {
  const [overview, setOverview] = useState<ProductAdsOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/advertising/overview`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setOverview((await response.json()) as ProductAdsOverview);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible consultar Product Ads",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const isReady = overview?.state === "READY";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <MercadoLibreLogo className="h-6" />
            <div>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-muted-foreground" />
                Product Ads
              </CardTitle>
              <CardDescription>
                Consulta campañas y resultados de los últimos 30 días.
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadOverview()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {overview ? "Actualizar métricas" : "Consultar métricas"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert variant="info">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Solo lectura, sin gastos automáticos</AlertTitle>
          <AlertDescription>
            Este panel no crea, pausa ni modifica campañas o presupuestos. El
            dinero recibido por ventas sigue registrándose exclusivamente con la
            liquidación neta de cada venta de Mercado Libre.
          </AlertDescription>
        </Alert>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No se pudieron consultar las métricas</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {overview?.state === "NOT_ENABLED" ? (
          <Alert variant="warning">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Product Ads necesita activación</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <p>{overview.message}</p>
              <ol className="list-inside list-decimal">
                <li>
                  En la aplicación de Mercado Libre activa{" "}
                  <strong>
                    Publicidad de un producto: Lectura y escritura
                  </strong>
                  .
                </li>
                <li>Guarda los cambios y reconecta Mercado Libre aquí.</li>
                <li>
                  En Mercado Libre activa Publicidad para la cuenta vendedora.
                </li>
              </ol>
              <div className="flex flex-wrap gap-2">
                <Button asChild type="button" size="sm" variant="outline">
                  <a href={`/api/${storeId}/marketplaces/mercadolibre/connect`}>
                    Reconectar Mercado Libre
                  </a>
                </Button>
                <Button asChild type="button" size="sm" variant="outline">
                  <a
                    href="https://vendedores.mercadolibre.com.co/productAds"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir Publicidad
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        {overview?.state === "REAUTH_REQUIRED" ? (
          <Alert variant="warning">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Se debe reconectar Mercado Libre</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <p>{overview.message}</p>
              <Button asChild type="button" size="sm" className="w-fit">
                <a href={`/api/${storeId}/marketplaces/mercadolibre/connect`}>
                  Reconectar Mercado Libre
                </a>
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {isReady ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <p>
                {overview.advertiser.name ?? "Cuenta anunciante"} · Del{" "}
                {overview.range.from} al {overview.range.to}
              </p>
              <Badge variant="secondary">
                {formatNumber(overview.totalCampaigns)} campañas
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Inversión</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(overview.summary.cost, overview.currencyId)}
                </p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  Ventas atribuidas
                </p>
                <p className="text-lg font-semibold">
                  {formatCurrency(
                    overview.summary.totalAmount,
                    overview.currencyId,
                  )}
                </p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">ROAS</p>
                <p className="text-lg font-semibold">
                  {formatRatio(overview.summary.roas)}
                </p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">ACOS</p>
                <p className="text-lg font-semibold">
                  {formatPercent(overview.summary.acos)}
                </p>
              </div>
            </div>

            {overview.campaigns.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaña</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Clics</TableHead>
                    <TableHead className="text-right">Inversión</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                    <TableHead className="text-right">ACOS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.campaigns.map((campaign) => {
                    const status = getCampaignStatus(campaign.status);
                    return (
                      <TableRow key={campaign.id}>
                        <TableCell className="font-medium">
                          {campaign.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(campaign.metrics.clicks)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(
                            campaign.metrics.cost,
                            overview.currencyId,
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatRatio(campaign.metrics.roas)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatPercent(campaign.metrics.acos)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <Alert>
                <BarChart3 className="h-4 w-4" />
                <AlertTitle>Todavía no hay campañas con datos</AlertTitle>
                <AlertDescription>
                  Product Ads está conectado. Cuando Mercado Libre reporte una
                  campaña o métricas, aparecerán aquí sin modificar nada.
                </AlertDescription>
              </Alert>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
