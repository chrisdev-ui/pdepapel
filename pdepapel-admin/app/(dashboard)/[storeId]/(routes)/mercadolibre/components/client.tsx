"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, CheckCircle2, ExternalLink, Store } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";

import { MercadoLibreListingManager } from "./listing-manager";

type MarketplaceConnection = {
  sellerId: string | null;
  siteId: string;
  status:
    | "PENDING"
    | "CONNECTED"
    | "REAUTH_REQUIRED"
    | "DISCONNECTED"
    | "ERROR";
  lastSyncedAt: Date | null;
  lastError: string | null;
  recoveryScheduleId: string | null;
  updatedAt: Date;
} | null;

type MercadoLibreClientProps = {
  configuration: { configured: boolean; missing: readonly string[] };
  queueConfiguration: { configured: boolean; missing: readonly string[] };
  connection: MarketplaceConnection;
  products: {
    id: string;
    name: string;
    sku: string;
    price: number;
    stock: number;
  }[];
};

const connectionLabels = {
  PENDING: "Pendiente",
  CONNECTED: "Conectada",
  REAUTH_REQUIRED: "Requiere reconexión",
  DISCONNECTED: "Desconectada",
  ERROR: "Con error",
} as const;

function formatDate(value: Date | null) {
  if (!value) return "Aún no hay sincronizaciones";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

export default function MercadoLibreClient({
  configuration,
  queueConfiguration,
  connection,
  products,
}: MercadoLibreClientProps) {
  const { storeId } = useParams<{ storeId: string }>();
  const searchParams = useSearchParams();
  const result = searchParams.get("mercadolibre");
  const reason = searchParams.get("reason");
  const [isActivatingQueue, setIsActivatingQueue] = useState(false);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);

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
    setQueueMessage(null);
    try {
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/queue`,
        { method: "POST" },
      );
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "No fue posible activar la cola");
      }
      setQueueMessage(
        "La recuperación automática quedó activada. Actualiza esta página para ver su estado.",
      );
    } catch (error) {
      setQueueMessage(
        error instanceof Error
          ? error.message
          : "No fue posible activar la cola",
      );
    } finally {
      setIsActivatingQueue(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mercado Libre</h1>
          <p className="text-sm text-muted-foreground">
            Un canal adicional con precios e inventario controlados desde P de
            Papel.
          </p>
        </div>
        <Badge
          variant={connection?.status === "CONNECTED" ? "success" : "secondary"}
        >
          {connection ? connectionLabels[connection.status] : "Sin conectar"}
        </Badge>
      </div>

      {resultMessage ? (
        <div
          className={
            result === "connected"
              ? "flex items-start gap-3 rounded-md border border-success/30 bg-success/10 p-4 text-sm"
              : "flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm"
          }
          role="status"
        >
          {result === "connected" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <p>{resultMessage}</p>
        </div>
      ) : null}

      {!configuration.configured ? (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Configuración pendiente
            </CardTitle>
            <CardDescription>
              La conexión permanece bloqueada hasta que el servidor tenga sus
              credenciales seguras.
            </CardDescription>
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
            <CardTitle>Cuenta vendedora</CardTitle>
            <CardDescription>
              Autoriza solo la cuenta principal de P de Papel con permisos de
              administrador.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 text-sm">
              <p>
                {connection?.sellerId
                  ? `Vendedor Mercado Libre: ${connection.sellerId}`
                  : "Aún no hay una cuenta autorizada."}
              </p>
              <p className="text-muted-foreground">
                Última actividad: {formatDate(connection?.lastSyncedAt ?? null)}
              </p>
              {connection?.lastError ? (
                <p className="text-destructive">{connection.lastError}</p>
              ) : null}
            </div>
            <Button
              type="button"
              onClick={() => {
                window.location.assign(
                  `/api/${storeId}/marketplaces/mercadolibre/connect`,
                );
              }}
            >
              <Store className="mr-2 h-4 w-4" />
              {connection
                ? "Reconectar Mercado Libre"
                : "Conectar Mercado Libre"}
            </Button>
          </CardContent>
        </Card>
      )}

      {connection ? (
        <Card
          className={
            queueConfiguration.configured
              ? "border-success/30"
              : "border-amber-300"
          }
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {queueConfiguration.configured ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-600" />
              )}
              Procesamiento seguro de ventas
            </CardTitle>
            <CardDescription>
              QStash procesa los avisos y reintentos sin dejar ventas o stock a
              medio camino.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!queueConfiguration.configured ? (
              <>
                <p>
                  Agrega estas variables en Vercel antes de registrar el
                  webhook:
                </p>
                <ul className="list-inside list-disc space-y-1 font-mono text-xs">
                  {queueConfiguration.missing.map((variable) => (
                    <li key={variable}>{variable}</li>
                  ))}
                </ul>
              </>
            ) : connection.recoveryScheduleId ? (
              <p className="text-success">
                La recuperación automática está activa cada cinco minutos.
              </p>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => void activateQueue()}
                disabled={isActivatingQueue}
              >
                {isActivatingQueue
                  ? "Activando…"
                  : "Activar procesamiento seguro"}
              </Button>
            )}
            {queueMessage ? (
              <p className="text-muted-foreground">{queueMessage}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <MercadoLibreListingManager
        storeId={storeId}
        products={products}
        canPublish={
          connection?.status === "CONNECTED" &&
          queueConfiguration.configured &&
          Boolean(connection.recoveryScheduleId)
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Próximos pasos</CardTitle>
          <CardDescription>
            La integración se activa por etapas para proteger el inventario y
            las ventas actuales.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-3">
          <div className="space-y-1 rounded-md bg-muted/50 p-4">
            <p className="font-semibold">1. Conectar</p>
            <p className="text-muted-foreground">
              Autoriza la cuenta vendedora una sola vez.
            </p>
          </div>
          <div className="space-y-1 rounded-md bg-muted/50 p-4">
            <p className="font-semibold">2. Preparar publicaciones</p>
            <p className="text-muted-foreground">
              Cada producto tendrá precio propio, categoría y stock de
              seguridad.
            </p>
          </div>
          <div className="space-y-1 rounded-md bg-muted/50 p-4">
            <p className="font-semibold">3. Activar sincronización</p>
            <p className="text-muted-foreground">
              Las ventas confirmadas entrarán por webhook y quedarán auditadas.
            </p>
          </div>
        </CardContent>
      </Card>

      <a
        href="https://www.mercadolibre.com.co/"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
      >
        Abrir Mercado Libre
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </>
  );
}
