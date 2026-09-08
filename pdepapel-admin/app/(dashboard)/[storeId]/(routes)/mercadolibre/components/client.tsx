"use client";

import { AlertCircle, CheckCircle2, ExternalLink, Link2, ListOrdered } from "lucide-react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { MercadoLibreLogo } from "@/components/mercadolibre-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MERCADOLIBRE_RECOVERY_INTERVAL_MINUTES } from "@/lib/mercadolibre/recovery-schedule";
import { cn } from "@/lib/utils";

import { TintBadge } from "../../pedidos/components/order-badges";
import { MercadoLibreCashflowSummary } from "./cashflow-summary";
import { MercadoLibreHistoricalSales } from "./historical-sales";
import { MercadoLibreListingManager } from "./listing-manager";
import { MercadoLibreOperationsCenter } from "./operations-center";
import { MercadoLibreProductAdsOverview } from "./product-ads-overview";

type MarketplaceConnection = {
  sellerId: string | null;
  siteId: string;
  status: "PENDING" | "CONNECTED" | "REAUTH_REQUIRED" | "DISCONNECTED" | "ERROR";
  lastSyncedAt: Date | null;
  lastError: string | null;
  recoveryScheduleId: string | null;
  updatedAt: Date;
} | null;

type MercadoLibreClientProps = {
  configuration: { configured: boolean; missing: readonly string[] };
  queueConfiguration: { configured: boolean; missing: readonly string[] };
  connection: MarketplaceConnection;
};

type QueueFeedback = { message: string; type: "error" | "success" };

export const MERCADOLIBRE_TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "publicaciones", label: "Publicaciones" },
  { id: "ventas", label: "Ventas" },
  { id: "preguntas", label: "Preguntas y reclamos" },
  { id: "envios", label: "Envíos" },
  { id: "anuncios", label: "Anuncios y videos" },
] as const;
export type MercadoLibreTab = (typeof MERCADOLIBRE_TABS)[number]["id"];
const TAB_PARAM = "tab";

function isTab(value: string | null): value is MercadoLibreTab {
  return MERCADOLIBRE_TABS.some((tab) => tab.id === value);
}

const CONNECTION_BADGE: Record<NonNullable<MarketplaceConnection>["status"], { label: string; tone: string }> = {
  PENDING: { label: "Pendiente", tone: "cream" },
  CONNECTED: { label: "Conectada", tone: "mint" },
  REAUTH_REQUIRED: { label: "Requiere reconexión", tone: "pink" },
  DISCONNECTED: { label: "Desconectada", tone: "slate" },
  ERROR: { label: "Con error", tone: "pink" },
};

const DATE_TIME = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });

export default function MercadoLibreClient({ configuration, queueConfiguration, connection }: MercadoLibreClientProps) {
  const { storeId } = useParams<{ storeId: string }>();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const result = searchParams.get("mercadolibre");
  const reason = searchParams.get("reason");
  const requested = searchParams.get(TAB_PARAM);
  const initialTab: MercadoLibreTab = isTab(requested)
    ? requested
    : searchParams.get("listing")
      ? "publicaciones"
      : searchParams.get("order")
        ? "ventas"
        : "resumen";
  const [tab, setTabState] = useState<MercadoLibreTab>(initialTab);
  const [isActivatingQueue, setIsActivatingQueue] = useState(false);
  const [queueFeedback, setQueueFeedback] = useState<QueueFeedback | null>(null);

  const connected = connection?.status === "CONNECTED";
  const canOperate = connected && queueConfiguration.configured && Boolean(connection?.recoveryScheduleId);
  const queueState = !queueConfiguration.configured
    ? "configuration"
    : connection?.recoveryScheduleId || queueFeedback?.type === "success"
      ? "active"
      : queueFeedback?.type === "error"
        ? "error"
        : "ready";

  const setTab = useCallback(
    (next: MercadoLibreTab) => {
      setTabState(next);
      const query = new URLSearchParams(searchParams.toString());
      if (next === "resumen") query.delete(TAB_PARAM);
      else query.set(TAB_PARAM, next);
      const suffix = query.toString();
      window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
    },
    [pathname, searchParams],
  );

  const resultMessage =
    result === "connected"
      ? "La cuenta de Mercado Libre quedó conectada de forma segura."
      : result === "error" && reason === "configuration"
        ? "Falta una configuración segura en el servidor. Revisa las variables indicadas antes de intentar de nuevo."
        : result === "error"
          ? "No fue posible completar la autorización. Puedes intentarlo de nuevo desde esta página."
          : null;

  const activateQueue = async () => {
    setIsActivatingQueue(true);
    setQueueFeedback(null);
    try {
      const response = await fetch(`/api/${storeId}/marketplaces/mercadolibre/queue`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "No fue posible activar la cola");
      }
      setQueueFeedback({
        type: "success",
        message: `La programación quedó actualizada. QStash ejecutará la recuperación cada ${MERCADOLIBRE_RECOVERY_INTERVAL_MINUTES} minutos.`,
      });
    } catch (error) {
      setQueueFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No fue posible activar el procesamiento seguro.",
      });
    } finally {
      setIsActivatingQueue(false);
    }
  };

  const badge = connection ? CONNECTION_BADGE[connection.status] : { label: "Sin conectar", tone: "slate" };
  const blockedCopy = !configuration.configured
    ? "Faltan credenciales seguras en el servidor."
    : !connected
      ? "Conecta la cuenta vendedora para usar esta sección."
      : !canOperate
        ? "Activa el procesamiento seguro en Resumen para publicar y conciliar."
        : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-primary">Mercado Libre</h1>
            <TintBadge label={badge.label} tone={badge.tone} />
          </div>
          <p className="text-sm text-muted-foreground">
            Un canal más con precio propio y stock controlado desde P de Papel. Lo urgente también aparece en Inicio.
          </p>
        </div>
        <a
          href="https://www.mercadolibre.com.co/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Abrir Mercado Libre
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>

      <div role="tablist" aria-label="Secciones de Mercado Libre" className="flex max-w-full gap-1 overflow-x-auto self-start rounded-full border bg-white p-1">
        {MERCADOLIBRE_TABS.map((item) => {
          const active = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={cn(
                "flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-primary text-primary-foreground" : "text-primary hover:bg-accent",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {resultMessage ? (
        <div
          className={cn(
            "flex items-start gap-3 rounded-md border p-4 text-sm",
            result === "connected" ? "border-success/30 bg-success/10" : "border-destructive/30 bg-destructive/10",
          )}
          role="status"
        >
          {result === "connected" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <p>{resultMessage}</p>
        </div>
      ) : null}

      {tab === "resumen" && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {!configuration.configured ? (
              <Card className="border-amber-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertCircle className="h-5 w-5 text-amber-600" aria-hidden="true" />
                    Configuración pendiente
                  </CardTitle>
                  <CardDescription>La conexión permanece bloqueada hasta que el servidor tenga sus credenciales seguras.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>Variables que deben agregarse únicamente en Vercel:</p>
                  <ul className="list-inside list-disc space-y-1 font-mono text-xs">
                    {configuration.missing.map((variable) => (
                      <li key={variable}>{variable}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MercadoLibreLogo variant="mark" className="h-5 w-5" />
                    Cuenta vendedora
                  </CardTitle>
                  <CardDescription>Autoriza solo la cuenta principal de P de Papel con permisos de administrador.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1 text-sm">
                    <p>{connection?.sellerId ? `Vendedor Mercado Libre: ${connection.sellerId}` : "Aún no hay una cuenta autorizada."}</p>
                    <p className="text-muted-foreground">
                      Última actividad: {connection?.lastSyncedAt ? DATE_TIME.format(new Date(connection.lastSyncedAt)) : "aún no hay sincronizaciones"}
                    </p>
                    {connection?.lastError ? <p className="text-destructive">{connection.lastError}</p> : null}
                  </div>
                  <Button
                    type="button"
                    variant={connected ? "outline" : "default"}
                    onClick={() => window.location.assign(`/api/${storeId}/marketplaces/mercadolibre/connect`)}
                  >
                    <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    {connection ? "Reconectar" : "Conectar Mercado Libre"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {connection ? (
              <Card
                className={cn(
                  queueState === "active" && "border-success/30",
                  queueState === "error" && "border-destructive/50",
                  queueState === "configuration" && "border-amber-300",
                )}
              >
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ListOrdered className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      Procesamiento seguro de ventas
                    </CardTitle>
                    <TintBadge
                      label={
                        queueState === "active"
                          ? "Activo"
                          : queueState === "error"
                            ? "No se activó"
                            : queueState === "configuration"
                              ? "Configuración pendiente"
                              : "Listo para activar"
                      }
                      tone={queueState === "active" ? "mint" : queueState === "error" ? "pink" : queueState === "configuration" ? "cream" : "slate"}
                    />
                  </div>
                  <CardDescription>QStash procesa los avisos y reintentos sin dejar ventas o stock a medio camino.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {!queueConfiguration.configured ? (
                    <>
                      <p>Agrega estas variables en Vercel antes de registrar el webhook:</p>
                      <ul className="list-inside list-disc space-y-1 font-mono text-xs">
                        {queueConfiguration.missing.map((variable) => (
                          <li key={variable}>{variable}</li>
                        ))}
                      </ul>
                    </>
                  ) : queueState === "active" ? (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-success">La recuperación automática está activa cada {MERCADOLIBRE_RECOVERY_INTERVAL_MINUTES} minutos.</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => void activateQueue()} isLoading={isActivatingQueue}>
                        Actualizar programación
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant={queueState === "error" ? "default" : "outline"}
                      onClick={() => void activateQueue()}
                      isLoading={isActivatingQueue}
                    >
                      {queueState === "error" ? "Reintentar activación" : "Activar procesamiento seguro"}
                    </Button>
                  )}
                  {queueFeedback ? (
                    <div
                      className={cn(
                        "flex items-start gap-2 rounded-md border p-3",
                        queueFeedback.type === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-success/30 bg-success/10 text-success",
                      )}
                      role={queueFeedback.type === "error" ? "alert" : "status"}
                    >
                      {queueFeedback.type === "error" ? (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      )}
                      <p>{queueFeedback.message}</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </div>
          {connected ? <MercadoLibreOperationsCenter storeId={storeId} sections={["resumen"]} /> : null}
          {connected ? <MercadoLibreCashflowSummary storeId={storeId} /> : null}
        </>
      )}

      {tab !== "resumen" && blockedCopy && tab !== "ventas" && tab !== "publicaciones" ? (
        <p className="rounded-md border border-amber-300 bg-amber-50/60 p-4 text-sm text-amber-900">{blockedCopy}</p>
      ) : null}

      {tab === "publicaciones" && (
        <MercadoLibreListingManager storeId={storeId} highlightedListingId={searchParams.get("listing")} canPublish={canOperate} />
      )}

      {tab === "ventas" && (
        <>
          <MercadoLibreHistoricalSales storeId={storeId} highlightedOrderId={searchParams.get("order")} canReconcile={canOperate} />
          {connected ? <MercadoLibreOperationsCenter storeId={storeId} sections={["rentabilidad"]} /> : null}
        </>
      )}

      {tab === "preguntas" && connected && <MercadoLibreOperationsCenter storeId={storeId} sections={["preguntas", "reclamos"]} />}

      {tab === "envios" && connected && <MercadoLibreOperationsCenter storeId={storeId} sections={["envios"]} />}

      {tab === "anuncios" && connected && (
        <>
          <MercadoLibreProductAdsOverview storeId={storeId} />
          <p className="text-sm text-muted-foreground">
            Los videos se suben desde cada publicación: abre Publicaciones, elige la publicación y usa «Videos del producto».
          </p>
        </>
      )}
    </div>
  );
}
