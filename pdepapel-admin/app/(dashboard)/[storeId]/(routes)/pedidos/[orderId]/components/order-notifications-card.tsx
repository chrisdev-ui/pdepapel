"use client";

import axios from "axios";
import { Mail, MessageCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import type { OrderNotificationsView } from "@/lib/order-notifications-view";
import { isShipmentMilestone, type ShipmentMilestone } from "@/lib/shipment-milestones";
import { isSilentChangeMilestone, silentChangeLabel } from "@/lib/silent-status-change";

const MILESTONE_LABEL: Record<ShipmentMilestone, string> = {
  guia_creada: "Ya tiene guía de envío",
  en_camino: "En tránsito",
  en_reparto: "Sale a entrega",
  entregado: "Entregado",
  novedad: "Novedad del envío",
};

const milestoneLabel = (milestone: string) =>
  isShipmentMilestone(milestone) ? MILESTONE_LABEL[milestone] : isSilentChangeMilestone(milestone) ? silentChangeLabel(milestone) : milestone;

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  SENT: { label: "Enviado", variant: "secondary" },
  FAILED: { label: "Falló", variant: "destructive" },
  SKIPPED: { label: "No aplica", variant: "outline" },
};

const fmt = (value: Date | string) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date(value));

/**
 * «Avisos a la clienta»: qué correos y WhatsApp de envío salieron, cuáles
 * fallaron y por qué, con «Reenviar»; y si este pedido tiene avisos por
 * WhatsApp. Solo la dueña.
 */
export function OrderNotificationsCard({ storeId, orderId, view }: { storeId: string; orderId: string; view: OrderNotificationsView }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, request: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await request();
      toast({ description: done });
      router.refresh();
    } catch (error) {
      toast({ variant: "destructive", description: getErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const resend = (milestone: ShipmentMilestone) =>
    run(`resend:${milestone}`, () => axios.post(`/api/${storeId}/orders/${orderId}/notifications`, { milestone }), "Aviso reenviado.");
  const optIn = (action: "record" | "remove") =>
    run(
      `optin:${action}`,
      () => axios.post(`/api/${storeId}/orders/${orderId}/whatsapp-opt-in`, { action }),
      action === "record" ? "Anotado: la clienta pidió avisos por WhatsApp." : "Listo: este pedido ya no recibe avisos por WhatsApp.",
    );

  const { whatsapp } = view;
  const active = Boolean(whatsapp.optInAt && !whatsapp.optOutAt);
  const sentMilestones = Array.from(new Set(view.rows.filter((r) => r.channel === "EMAIL" && r.role === "customer").map((r) => r.milestone)));

  return (
    <Card data-testid="order-notifications-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Avisos a la clienta</CardTitle>
        {view.hasGuide && !sentMilestones.includes("guia_creada") && (
          <Button type="button" size="sm" variant="outline" className="min-h-[44px]" disabled={busy !== null} isLoading={busy === "resend:guia_creada"} onClick={() => resend("guia_creada")}>
            Enviar aviso de la guía
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2">
            <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              {active ? (
                <>
                  Recibe avisos por WhatsApp desde el {fmt(whatsapp.optInAt as Date)}
                  {whatsapp.source === "PANEL_CHAT" ? " (los pidió en el chat; anotado en el panel)" : " (casilla del checkout)"}.
                </>
              ) : whatsapp.optOutAt ? (
                <>Pidió no recibir avisos por WhatsApp ({fmt(whatsapp.optOutAt)}).</>
              ) : (
                <>Sin avisos por WhatsApp: no los pidió.</>
              )}
              {active && !whatsapp.switchOn && (
                <span className="block text-xs text-muted-foreground">Los avisos por WhatsApp están apagados en Configuración; por ahora solo sale el correo.</span>
              )}
            </span>
          </p>
          {active ? (
            <Button type="button" size="sm" variant="ghost" className="min-h-[44px] shrink-0" disabled={busy !== null} isLoading={busy === "optin:remove"} onClick={() => optIn("remove")}>
              Quitar avisos por WhatsApp
            </Button>
          ) : whatsapp.canRecord ? (
            <Button type="button" size="sm" variant="outline" className="min-h-[44px] shrink-0" disabled={busy !== null} isLoading={busy === "optin:record"} onClick={() => optIn("record")}>
              Los pidió en el chat
            </Button>
          ) : null}
        </div>

        {view.rows.length === 0 ? (
          <p className="text-muted-foreground">Todavía no ha salido ningún aviso de envío para este pedido.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {view.rows.map((row) => {
              const status = STATUS[row.status] ?? STATUS.SKIPPED;
              const milestone = isShipmentMilestone(row.milestone) ? row.milestone : null;
              return (
                <li key={row.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-2">
                    {row.channel === "EMAIL" ? (
                      <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Correo" />
                    ) : (
                      <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="WhatsApp" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">
                        {milestoneLabel(row.milestone)}
                        <span className="font-normal text-muted-foreground"> · {row.role === "admin" ? "copia a la tienda" : "a la clienta"}{row.resent ? " · reenviado" : ""}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{fmt(row.createdAt)}</p>
                      {row.reason && row.status !== "SENT" && <p className="break-words text-xs text-muted-foreground">{row.reason}</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
                    <Badge variant={status.variant}>{status.label}</Badge>
                    {milestone && row.channel === "EMAIL" && row.role === "customer" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="min-h-[44px]"
                        disabled={busy !== null}
                        isLoading={busy === `resend:${milestone}`}
                        onClick={() => resend(milestone)}
                        aria-label={`Reenviar «${MILESTONE_LABEL[milestone]}»`}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        Reenviar
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
