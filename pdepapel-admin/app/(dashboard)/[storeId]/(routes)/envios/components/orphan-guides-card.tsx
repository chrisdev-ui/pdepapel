"use client";

import axios from "axios";
import { Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import type { OrphanGuide } from "@/lib/orphan-guides";
import { getReadableStatus } from "@/lib/utils";

const fmt = (value: Date | string) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date(value));

/**
 * Guías de EnvioClick que llegan sin pedido (se hicieron directo en
 * envioclick.com). Vincular una a un pedido le da avisos a la clienta,
 * inventario y ventas; «Crear pedido desde esta guía» abre un pedido nuevo que
 * la vincula al guardarse; «Descartar» la saca de la lista (de prueba o anulada).
 */
export function OrphanGuidesCard({ storeId, guides }: { storeId: string; guides: OrphanGuide[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [confirmDismiss, setConfirmDismiss] = useState<string | null>(null);

  if (guides.length === 0) return null;

  const act = async (idOrder: string, body: Record<string, string>, done: string) => {
    setBusy(idOrder);
    try {
      const response = await axios.post(`/api/${storeId}/shipments/orphan-guides/${idOrder}`, body);
      toast({ description: body.action === "link" ? `${done} ${response.data.orderNumber}.` : done, variant: "success" });
      setLinking(null);
      setOrderNumber("");
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
          Se hicieron directo en EnvioClick. Sin pedido, la clienta no recibe avisos y la venta no cuenta en inventario ni
          en ventas. Vincúlala al pedido, crea el pedido desde aquí o descártala si fue de prueba o se anuló.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border">
          {guides.map((guide) => (
            <li key={guide.idOrder} className="flex flex-col gap-3 p-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">
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
                <form
                  className="flex flex-col gap-2 sm:flex-row sm:items-center"
                  onSubmit={(event) => {
                    event.preventDefault();
                    act(guide.idOrder, { action: "link", orderNumber }, "Guía vinculada al pedido");
                  }}
                >
                  <label className="sr-only" htmlFor={`orden-${guide.idOrder}`}>
                    Número del pedido
                  </label>
                  <Input
                    id={`orden-${guide.idOrder}`}
                    value={orderNumber}
                    onChange={(event) => setOrderNumber(event.target.value)}
                    placeholder="ORD-…"
                    autoComplete="off"
                    className="h-11 sm:max-w-xs"
                    disabled={busy !== null}
                  />
                  <div className="flex gap-2">
                    <Button type="submit" className="min-h-[44px]" disabled={busy !== null || !orderNumber.trim()} isLoading={busy === guide.idOrder}>
                      Vincular
                    </Button>
                    <Button type="button" variant="ghost" className="min-h-[44px]" disabled={busy !== null} onClick={() => setLinking(null)}>
                      Cancelar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground sm:basis-full">La clienta recibe un aviso: el del estado actual del envío.</p>
                </form>
              ) : confirmDismiss === guide.idOrder ? (
                <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm">¿Descartar esta guía? Sale de la lista y sus avisos nuevos también se ignoran.</p>
                  <div className="flex gap-2">
                    <Button type="button" variant="destructive" className="min-h-[44px]" disabled={busy !== null} isLoading={busy === guide.idOrder} onClick={() => act(guide.idOrder, { action: "dismiss" }, "Guía descartada.")}>
                      Sí, descartar
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
                    Descartar
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
