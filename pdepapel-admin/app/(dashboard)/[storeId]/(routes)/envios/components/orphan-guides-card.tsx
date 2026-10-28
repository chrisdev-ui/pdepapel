"use client";

import axios from "axios";
import { Search, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { NotifyCustomerCheckbox } from "@/components/orders/notify-customer-checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import type { LinkCandidate, OrphanGuide } from "@/lib/orphan-guides";
import { cn, currencyFormatter, getReadableStatus } from "@/lib/utils";

const fmt = (value: Date | string) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date(value));
const fmtDay = (value: Date | string) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" }).format(new Date(value));

export const LINK_NOTIFY_HELP = "Quítalo si el pedido ya se entregó o ya le avisaste.";

/**
 * Guías de EnvioClick que llegan sin pedido (se hicieron directo en
 * envioclick.com). «Vincular a un pedido» sugiere los pedidos posibles y la
 * vincula en dos toques; «Crear pedido desde esta guía» abre un pedido nuevo
 * que la vincula al guardarse; «Ocultar (no es de un pedido)» la saca de la
 * lista para siempre (de prueba o anulada).
 */
export function OrphanGuidesCard({ storeId, guides }: { storeId: string; guides: OrphanGuide[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [confirmDismiss, setConfirmDismiss] = useState<string | null>(null);

  if (guides.length === 0) return null;

  const dismiss = async (idOrder: string) => {
    setBusy(idOrder);
    try {
      await axios.post(`/api/${storeId}/shipments/orphan-guides/${idOrder}`, { action: "dismiss" });
      toast({ description: "Guía ocultada.", variant: "success" });
      setConfirmDismiss(null);
      router.refresh();
    } catch (error) {
      toast({ variant: "destructive", description: getErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card id="guias-sin-pedido" data-testid="orphan-guides-card" className="scroll-mt-24">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Guías de EnvioClick sin pedido ({guides.length})
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Guías hechas directo en EnvioClick que todavía no están en un pedido. Vincúlalas para que la clienta reciba los avisos y la
          venta cuente; si escribes el número de guía en el pedido, se vinculan solas.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border">
          {guides.map((guide) => (
            <li key={guide.idOrder} className="flex flex-col gap-3 p-3" data-testid={`orphan-guide-${guide.idOrder}`}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-medium">
                    {guide.carrier ?? "Transportadora"} · guía {guide.trackingCode ?? `EnvioClick ${guide.idOrder}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Primer aviso {fmt(guide.firstSeenAt)} · último {fmt(guide.lastSeenAt)} · {guide.notices} {guide.notices === 1 ? "aviso" : "avisos"}
                  </p>
                </div>
                <Badge variant="outline" className="self-start sm:self-auto">
                  {getReadableStatus(guide.status)}
                </Badge>
              </div>

              {linking === guide.idOrder ? (
                <LinkPanel
                  storeId={storeId}
                  guide={guide}
                  disabled={busy !== null && busy !== guide.idOrder}
                  onBusy={(value) => setBusy(value ? guide.idOrder : null)}
                  onCancel={() => setLinking(null)}
                  onLinked={(orderNumber, status) => {
                    toast({ description: `Guía vinculada a ${orderNumber}: ${getReadableStatus(status)}.`, variant: "success" });
                    setLinking(null);
                    router.refresh();
                  }}
                />
              ) : confirmDismiss === guide.idOrder ? (
                <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-2 sm:flex-row sm:items-center sm:justify-between" role="alertdialog" aria-label="Ocultar guía">
                  <p className="text-sm">
                    ¿Ocultar esta guía? Sale de la lista y <strong>ya no se podrá vincular a un pedido</strong>, ni sus avisos nuevos. Úsalo
                    solo si no es de un pedido (de prueba o anulada).
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="destructive" className="min-h-[44px]" disabled={busy !== null} isLoading={busy === guide.idOrder} onClick={() => dismiss(guide.idOrder)}>
                      Sí, ocultar
                    </Button>
                    <Button type="button" variant="ghost" className="min-h-[44px]" disabled={busy !== null} onClick={() => setConfirmDismiss(null)}>
                      No
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" className="min-h-[44px]" disabled={busy !== null} onClick={() => setLinking(guide.idOrder)}>
                    Vincular a un pedido
                  </Button>
                  <Button asChild type="button" size="sm" variant="outline" className="min-h-[44px]">
                    <Link href={`/${storeId}/pedidos/nuevo?guia=${guide.idOrder}`}>Crear pedido desde esta guía</Link>
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="min-h-[44px]" disabled={busy !== null} onClick={() => setConfirmDismiss(guide.idOrder)}>
                    Ocultar (no es de un pedido)
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** «Vincular a un pedido»: pedidos sugeridos, buscador y «Avisar a la clienta». */
function LinkPanel({
  storeId,
  guide,
  disabled,
  onBusy,
  onCancel,
  onLinked,
}: {
  storeId: string;
  guide: OrphanGuide;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onCancel: () => void;
  onLinked: (orderNumber: string, status: OrphanGuide["status"]) => void;
}) {
  const { toast } = useToast();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [candidates, setCandidates] = useState<LinkCandidate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setCandidates(null);
    setLoadError(null);
    axios
      .get<{ candidates: LinkCandidate[] }>(`/api/${storeId}/shipments/orphan-guides/${guide.idOrder}`, { params: debounced ? { q: debounced } : {} })
      .then((response) => {
        if (cancelled) return;
        setCandidates(response.data.candidates);
        // El mismo número de guía ya escrito en un pedido: queda elegido.
        const match = response.data.candidates.find((candidate) => candidate.trackingMatch);
        if (match) setSelected((current) => current ?? match.orderNumber);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(getErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, guide.idOrder, debounced]);

  const link = async () => {
    if (!selected) return;
    setSaving(true);
    onBusy(true);
    try {
      const response = await axios.post<{ orderNumber: string; status: OrphanGuide["status"] }>(
        `/api/${storeId}/shipments/orphan-guides/${guide.idOrder}`,
        { action: "link", orderNumber: selected, notifyCustomer },
      );
      onLinked(response.data.orderNumber, response.data.status);
    } catch (error) {
      toast({ variant: "destructive", description: getErrorMessage(error) });
    } finally {
      setSaving(false);
      onBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3" data-testid="orphan-guide-link-panel">
      <div className="flex flex-col gap-1">
        <label htmlFor={searchId} className="text-sm font-medium">
          ¿De qué pedido es esta guía?
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={searchId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Número de pedido, nombre o últimas cifras del celular"
            autoComplete="off"
            className="h-11 pl-9"
            disabled={saving}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {debounced ? "Resultados de la búsqueda." : "Sugeridos: pedidos sin guía de los 14 días antes de la guía, el más cercano primero."}
        </p>
      </div>

      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : candidates === null ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Buscando pedidos…
        </p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {debounced ? "Ningún pedido sin guía coincide." : "No hay pedidos sin guía en esas fechas. Búscalo por número, nombre o celular."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Pedidos para vincular">
          {candidates.map((candidate) => {
            const active = selected === candidate.orderNumber;
            return (
              <li key={candidate.orderId}>
                <button
                  type="button"
                  aria-pressed={active}
                  disabled={saving}
                  onClick={() => setSelected(candidate.orderNumber)}
                  className={cn(
                    "flex min-h-11 w-full flex-col items-start gap-0.5 rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active && "border-primary ring-2 ring-primary",
                  )}
                >
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="break-all">{candidate.orderNumber}</span>
                    {candidate.trackingMatch && (
                      <Badge variant="outline" className="font-normal">
                        Mismo número de guía
                      </Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fmtDay(candidate.createdAt)} · {candidate.city ?? "Sin ciudad"} · {currencyFormatter(candidate.total)}
                    {candidate.phoneLast4 ? ` · cel …${candidate.phoneLast4}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <NotifyCustomerCheckbox checked={notifyCustomer} onCheckedChange={setNotifyCustomer} disabled={saving} help={LINK_NOTIFY_HELP} />

      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-[44px]" disabled={disabled || saving || !selected} isLoading={saving} onClick={link}>
          Vincular
        </Button>
        <Button type="button" variant="ghost" className="min-h-[44px]" disabled={saving} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Al vincular, el pedido toma el estado de la guía. Si dejas «Avisar a la clienta», le llega solo el aviso que todavía no tenga.
      </p>
    </div>
  );
}
