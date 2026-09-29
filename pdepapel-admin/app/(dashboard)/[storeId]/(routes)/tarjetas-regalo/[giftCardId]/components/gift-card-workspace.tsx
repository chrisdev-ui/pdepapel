"use client";

import axios from "axios";
import { ArrowLeft, MailCheck, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { TintBadge } from "@/components/ui/tint-badge";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import {
  GIFT_CARD_MOVEMENT_LABELS,
  GIFT_CARD_MOVEMENT_TONES,
  getGiftCardBadge,
} from "@/lib/gift-card-labels";
import { currencyFormatter } from "@/lib/utils";

import type { GiftCardDetail } from "../server/get-gift-card";

const fmt = (value: Date | string | null | undefined, withTime = true) =>
  value
    ? new Intl.DateTimeFormat("es-CO", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
        timeZone: "America/Bogota",
      }).format(new Date(value))
    : "—";

const signed = (amount: number) =>
  amount === 0 ? "—" : `${amount > 0 ? "+" : "−"} ${currencyFormatter(Math.abs(amount))}`;

/**
 * Ficha de una tarjeta: saldo, quién la compró y quién la recibe, el libro
 * de movimientos y «Reenviar correo». La misma cabecera con insignias que
 * un pedido; las secciones son tarjetas como en el resto del panel.
 */
export function GiftCardWorkspace({ storeId, card }: { storeId: string; card: GiftCardDetail }) {
  const router = useRouter();
  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [sending, setSending] = useState(false);
  const badge = getGiftCardBadge(card);
  const used = card.initialAmount - card.balance;
  const deliverTo = card.recipientEmail || card.buyerEmail;

  const reissue = async () => {
    const ok = await requestConfirmation({
      title: "¿Reenviar la tarjeta con un código nuevo?",
      description: `Se genera otro código con el mismo saldo (${currencyFormatter(card.balance)}) y sale por correo a ${deliverTo ?? "nadie: no hay correo"}. El código anterior deja de servir en ese instante.`,
      confirmLabel: "Reenviar con código nuevo",
    });
    if (!ok) return;
    setSending(true);
    try {
      const response = await axios.post(`/api/${storeId}/gift-cards/${card.id}/reissue`);
      const { delivered, deliveredTo, codeLast4 } = response.data as { delivered: boolean; deliveredTo: string | null; codeLast4: string };
      router.refresh();
      toast({
        title: delivered ? "Código nuevo enviado" : "Código nuevo, pero el correo falló",
        description: delivered
          ? `Ahora termina en ${codeLast4}. Salió a ${deliveredTo}.`
          : `Ahora termina en ${codeLast4}. Vuelve a intentar el reenvío o revisa el correo guardado.`,
        variant: delivered ? "success" : "warning",
      });
    } catch (error) {
      toast({ title: "No se pudo reenviar", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="icon-sm" aria-label="Volver a tarjetas de regalo">
              <Link href={`/${storeId}/tarjetas-regalo`}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold tracking-tight text-primary">Tarjeta que termina en {card.codeLast4}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TintBadge label={badge.label} tone={badge.tone} />
            {card.deliveredAt ? (
              <TintBadge label={`Correo enviado ${fmt(card.deliveredAt, false)}`} tone="sky" />
            ) : (
              <TintBadge label="Correo pendiente" tone="cream" />
            )}
            <span className="text-xs text-muted-foreground">
              {currencyFormatter(card.initialAmount)} · emitida el {fmt(card.issuedAt)}
            </span>
          </div>
        </div>
        {card.canWrite && card.status === "ACTIVE" && (
          <Button type="button" onClick={reissue} disabled={sending || !deliverTo} isLoading={sending} loadingText="Enviando…">
            <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            Reenviar correo
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <SectionCard id="libro" title="Movimientos" description="Cada cambio del saldo, del más antiguo al más reciente. El saldo es la suma de esta lista.">
            {card.movements.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin movimientos.</p>
            ) : (
              <ol className="flex flex-col divide-y">
                {card.movements.map((movement) => (
                  <li key={movement.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <TintBadge label={GIFT_CARD_MOVEMENT_LABELS[movement.type]} tone={GIFT_CARD_MOVEMENT_TONES[movement.type]} />
                        <span className="text-xs text-muted-foreground">{fmt(movement.createdAt)}</span>
                      </span>
                      {(movement.reason || movement.orderId) && (
                        <span className="text-xs text-muted-foreground">
                          {movement.reason}
                          {movement.orderId && (
                            <>
                              {movement.reason ? " · " : ""}
                              <Link href={`/${storeId}/pedidos/${movement.orderId}`} className="underline underline-offset-4">
                                ver pedido
                              </Link>
                            </>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-3 text-sm tabular-nums sm:flex-col sm:items-end sm:gap-0">
                      <span className={movement.amount < 0 ? "font-semibold text-destructive" : movement.amount > 0 ? "font-semibold text-emerald-700" : "text-muted-foreground"}>
                        {signed(movement.amount)}
                      </span>
                      <span className="text-xs text-muted-foreground">saldo {currencyFormatter(movement.balanceAfter)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>

          <SectionCard id="usos" title="Pedidos que la usaron" description="Compras pagadas, total o parcialmente, con esta tarjeta.">
            {card.redemptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía nadie la ha usado.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {card.redemptions.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="flex min-w-0 flex-col">
                      <Link href={`/${storeId}/pedidos/${order.id}`} className="font-semibold text-primary hover:underline">
                        {order.orderNumber}
                      </Link>
                      <span className="text-xs text-muted-foreground">{fmt(order.createdAt)}</span>
                    </span>
                    <span className="text-right tabular-nums">
                      <span className="font-semibold">{currencyFormatter(order.giftCardAmount)}</span>
                      <span className="block text-xs text-muted-foreground">de {currencyFormatter(order.total)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          <SectionCard id="saldo" title="Saldo">
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex items-baseline justify-between"><dt className="text-muted-foreground">Valor</dt><dd className="tabular-nums">{currencyFormatter(card.initialAmount)}</dd></div>
              <div className="flex items-baseline justify-between"><dt className="text-muted-foreground">Usado</dt><dd className="tabular-nums">{currencyFormatter(used)}</dd></div>
              <div className="flex items-baseline justify-between border-t pt-2"><dt className="font-semibold">Disponible</dt><dd className="text-xl font-bold tabular-nums text-primary">{currencyFormatter(card.balance)}</dd></div>
              <div className="flex items-baseline justify-between"><dt className="text-muted-foreground">Vence</dt><dd>{card.expiresAt ? fmt(card.expiresAt, false) : "No vence"}</dd></div>
            </dl>
          </SectionCard>

          <SectionCard id="personas" title="Quién compró y quién recibe">
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Quien compró</dt>
                <dd className="font-medium">
                  <Link href={`/${storeId}/pedidos/${card.purchaseOrder.id}`} className="hover:underline">{card.purchaseOrder.fullName}</Link>
                  <span className="block text-xs text-muted-foreground">
                    {card.buyerEmail ?? "correo oculto"} · pedido {card.purchaseOrder.orderNumber}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Quien recibe</dt>
                <dd className="font-medium">
                  {card.recipientName || "Se entrega en mano"}
                  <span className="block text-xs text-muted-foreground">
                    {card.recipientEmail ?? (card.recipientName ? "sin correo: el código fue a quien compró" : "el código fue a quien compró")}
                  </span>
                </dd>
              </div>
              {card.message && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Mensaje</dt>
                  <dd className="italic text-muted-foreground">«{card.message}»</dd>
                </div>
              )}
              <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                <MailCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                El código completo solo viaja por correo. Si la persona lo perdió, usa «Reenviar correo»: sale uno nuevo y el anterior deja de servir.
              </p>
            </dl>
          </SectionCard>
        </aside>
      </div>
      {confirmationDialog}
    </div>
  );
}
