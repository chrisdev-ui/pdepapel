"use client";

import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type FeedReport = {
  generatedAt: string;
  activeProducts: number;
  exportedProducts: number;
  outOfStock: number;
  withoutIdentifier: number;
  missingImages: Array<{ id: string; productId: string; name: string }>;
  rewrittenImages: Array<{ id: string; from: string; to: string }>;
  groupsWithDuplicateVariants: string[];
};

type FeedStatus = {
  configured: boolean;
  feedUrl: string | null;
  schedule: string;
  report: FeedReport | null;
};

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export function GoogleMerchantFeedCard({ storeId }: { storeId: string }) {
  const [status, setStatus] = useState<FeedStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/${storeId}/google-merchant/report`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("No se pudo consultar el estado del feed.");
      }
      setStatus((await response.json()) as FeedStatus);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo consultar el estado del feed.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const response = await fetch(`/api/${storeId}/google-merchant/report`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("No se pudo regenerar el feed.");
      }
      const result = (await response.json()) as { report: FeedReport };
      setStatus((current) =>
        current ? { ...current, report: result.report } : current,
      );
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "No se pudo regenerar el feed.",
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyFeedUrl = async () => {
    if (!status?.feedUrl) return;
    try {
      await navigator.clipboard.writeText(status.feedUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copia la URL manualmente desde el campo.");
    }
  };

  const report = status?.report ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-muted-foreground" />
          Feed de Google Merchant
        </CardTitle>
        <CardDescription>
          Google Merchant Center descarga el catálogo desde esta URL protegida.
          Se regenera solo, sin tocar productos, {status?.schedule?.toLowerCase() ?? "todos los días"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Consultando el estado del feed…
          </p>
        ) : null}

        {error ? (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        {status && !status.configured ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            El feed está apagado. Define{" "}
            <code className="rounded bg-white px-1">GOOGLE_MERCHANT_FEED_SECRET</code>{" "}
            en el proyecto de Vercel del administrador y vuelve a desplegar
            para activarlo.
          </p>
        ) : null}

        {status?.feedUrl ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">URL del feed (no la compartas)</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                readOnly
                value={status.feedUrl}
                aria-label="URL del feed de Google Merchant"
                className="font-mono text-xs"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                onClick={copyFeedUrl}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {copied ? "Copiada" : "Copiar"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              En Merchant Center: Productos → Feeds → Añadir feed → “Obtención
              programada”, pega esta URL y programa la descarga después de las
              8:30 a. m. Cualquiera con la URL puede leer el catálogo público;
              si se filtra, rota el secreto en Vercel.
            </p>
          </div>
        ) : null}

        {status?.configured ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={refresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Regenerar feed ahora
            </Button>
            <span className="text-sm text-muted-foreground">
              {report
                ? `Última generación: ${dateFormatter.format(new Date(report.generatedAt))}`
                : "Todavía no se ha generado; la primera descarga lo creará."}
            </span>
          </div>
        ) : null}

        {report ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ["Activos", report.activeProducts],
                ["Exportados", report.exportedProducts],
                ["Sin stock", report.outOfStock],
                ["Sin identificador", report.withoutIdentifier],
                ["Sin imagen", report.missingImages.length],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-md border p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-lg font-semibold">{value}</dd>
                </div>
              ))}
            </dl>

            {report.missingImages.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Productos sin imagen (Merchant los rechazará)
                </p>
                <ul className="space-y-1 text-sm">
                  {report.missingImages.slice(0, 20).map((product) => (
                    <li key={product.productId}>
                      <Link
                        href={`/${storeId}/productos/${product.productId}`}
                        className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                      >
                        {product.name}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                  {report.missingImages.length > 20 ? (
                    <li className="text-muted-foreground">
                      y {report.missingImages.length - 20} más.
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {report.groupsWithDuplicateVariants.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {report.groupsWithDuplicateVariants.length} grupo(s) se exportan
                sin <code>item_group_id</code> porque tienen variantes con los
                mismos atributos. Corrige esas variantes en Productos.
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
