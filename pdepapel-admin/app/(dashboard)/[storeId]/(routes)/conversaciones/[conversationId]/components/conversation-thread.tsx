"use client";

import axios from "axios";

import {
  canHandBackToBot,
  describeBotPause,
  formatBotPause,
} from "@/lib/conversation-bot-pause";
import { AlertTriangle, ArrowLeft, Bot, BotOff, CheckCircle2, Receipt, RotateCcw, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import {
  CONVERSATION_MESSAGE_STATUS_LABELS,
  CONVERSATION_SENT_BY_LABELS,
  CONVERSATION_STATUS_LABELS,
  describeMedia,
  type ConversationCart,
  type ConversationDetail,
  type ConversationThreadMessage,
} from "@/lib/conversations";
import { currencyFormatter } from "@/lib/utils";
import {
  ConversationMessageDirection,
  ConversationMessageSentBy,
  ConversationMessageStatus,
  ConversationStatus,
} from "@prisma/client";

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

/** El carrito que armó la clienta, ya cruzado con el catálogo de hoy. */
function CartCard({ cart }: { cart: ConversationCart }) {
  return (
    <div className="mt-2 space-y-2 rounded-md border bg-background/60 p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ShoppingBag className="h-4 w-4" aria-hidden="true" />
        Carrito del catálogo
      </p>
      <ul className="space-y-1 text-sm">
        {cart.lines.map((line) => (
          <li key={`${line.sku}-${line.quantity}`} className="flex justify-between gap-3">
            <span className="min-w-0">
              <span className="tabular-nums text-muted-foreground">{line.quantity}× </span>
              {line.product ? (
                <span>{line.product.name}</span>
              ) : (
                <span className="text-destructive">
                  {line.sku} (ya no está en el catálogo)
                </span>
              )}
              {line.product && line.product.stock < line.quantity ? (
                <span className="ml-2 text-xs text-destructive">
                  quedan {line.product.stock}
                </span>
              ) : null}
            </span>
            {line.product ? (
              <span className="shrink-0 tabular-nums">
                {currencyFormatter(line.product.price * line.quantity)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <Separator />
      <p className="flex justify-between text-sm font-medium">
        <span>Total con precios de hoy</span>
        <span className="tabular-nums">{currencyFormatter(cart.total)}</span>
      </p>
      {cart.priceChanged > 0 || cart.unresolved > 0 || cart.insufficientStock > 0 ? (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            {[
              cart.priceChanged > 0 &&
                `${cart.priceChanged} producto(s) cambiaron de precio desde que lo armó`,
              cart.insufficientStock > 0 && `${cart.insufficientStock} sin existencias suficientes`,
              cart.unresolved > 0 && `${cart.unresolved} ya no está(n) en el catálogo`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function MessageBubble({ message }: { message: ConversationThreadMessage }) {
  const fromCustomer = message.direction === ConversationMessageDirection.INBOUND;
  const fromBot = message.sentBy === ConversationMessageSentBy.BOT;
  const media = describeMedia(message.mediaType);

  return (
    <li className={fromCustomer ? "flex justify-start" : "flex justify-end"}>
      <div className="max-w-[85%] space-y-1 sm:max-w-[70%]">
        <div
          className={[
            "rounded-lg px-3 py-2 text-sm",
            fromCustomer
              ? "bg-muted"
              : fromBot
                ? "border border-dashed bg-background"
                : "bg-primary text-primary-foreground",
          ].join(" ")}
        >
          {message.body ? (
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          ) : (
            <p className="italic opacity-80">{media ?? "Mensaje sin texto"}</p>
          )}
          {message.body && media ? (
            <p className="mt-1 text-xs opacity-70">{media}</p>
          ) : null}
          {message.cart ? <CartCard cart={message.cart} /> : null}
        </div>
        <p
          className={[
            "flex gap-2 text-xs text-muted-foreground",
            fromCustomer ? "justify-start" : "justify-end",
          ].join(" ")}
        >
          <span>{CONVERSATION_SENT_BY_LABELS[message.sentBy]}</span>
          <span>{dateFormatter.format(message.createdAt)}</span>
          {message.status === ConversationMessageStatus.FAILED ? (
            <span className="text-destructive">
              {CONVERSATION_MESSAGE_STATUS_LABELS[message.status]}
            </span>
          ) : null}
        </p>
      </div>
    </li>
  );
}

export function ConversationThread({
  conversation,
  storeId,
}: {
  conversation: ConversationDetail;
  storeId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const isResolved = conversation.status === ConversationStatus.RESOLVED;
  // Solo se ofrece crear el pedido si de verdad llegó un carrito.
  const hasCart = conversation.messages.some((message) => message.cart !== null);

  const createOrder = async () => {
    try {
      setLoading(true);
      const { data } = await axios.post<{ orderId: string; existing: boolean }>(
        `/api/${storeId}/conversations/${conversation.id}/order`,
      );
      router.push(`/${storeId}/pedidos/${data.orderId}`);
      router.refresh();
      toast({
        title: data.existing ? "Este chat ya tenía un pedido" : "Pedido creado en borrador",
        description: data.existing
          ? "Te llevo al pedido que ya existía."
          : "Quedó con los productos del carrito. Faltan dirección, envío y pago.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "No se pudo crear el pedido",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * «Ya terminé, sigue tú». Quita la parada de 24 horas que deja Paula al
   * contestar desde el celular; no le manda nada a la clienta.
   */
  const handBack = async () => {
    try {
      setLoading(true);
      await axios.post(`/api/${storeId}/conversations/${conversation.id}/handback`);
      router.refresh();
      toast({
        title: "Listo, el bot vuelve a contestar",
        description: "No se le envió nada a la clienta.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "No se pudo devolver al bot",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const setStatus = async (status: ConversationStatus) => {
    try {
      setLoading(true);
      await axios.patch(`/api/${storeId}/conversations/${conversation.id}`, { status });
      router.refresh();
      toast({
        title: status === ConversationStatus.RESOLVED ? "Conversación resuelta" : "Conversación reabierta",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "No se pudo cambiar el estado",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const puedeDevolver = canHandBackToBot(conversation.lastOwnerAt);
  const pausaDelBot = formatBotPause(describeBotPause(conversation.lastOwnerAt));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Heading
          title={conversation.contactName?.trim() || "Sin nombre"}
          description={`${conversation.phone ?? (conversation.username ? `@${conversation.username}` : "Sin teléfono")} · ${conversation.messages.length} mensaje(s)`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isResolved ? "secondary" : "default"}>
            {CONVERSATION_STATUS_LABELS[conversation.status]}
          </Badge>
          {/* Tras contestar Paula, el estado vuelve a «Abierta» pero el bot
              sigue callado 24 h. Sin decirlo, ella no tenía cómo saberlo. */}
          {pausaDelBot ? (
            <span className="flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <BotOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pausaDelBot}
            </span>
          ) : null}
          {conversation.orderId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/${storeId}/pedidos/${conversation.orderId}`)}
            >
              <Receipt className="mr-2 h-4 w-4" /> Ver pedido
            </Button>
          ) : hasCart ? (
            <Button variant="outline" size="sm" disabled={loading} onClick={createOrder}>
              <Receipt className="mr-2 h-4 w-4" /> Crear pedido
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={loading || !puedeDevolver}
            onClick={handBack}
            title={
              puedeDevolver
                ? "Quita la pausa y deja que el bot vuelva a contestar."
                : "El bot ya está contestando: no hay pausa que quitar."
            }
          >
            <Bot className="mr-2 h-4 w-4" /> Reanudar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() =>
              setStatus(isResolved ? ConversationStatus.OPEN : ConversationStatus.RESOLVED)
            }
          >
            {isResolved ? (
              <>
                <RotateCcw className="mr-2 h-4 w-4" /> Reabrir
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar como resuelta
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/${storeId}/conversaciones`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
          </Button>
        </div>
      </div>
      <Separator />
      <Card>
        <CardContent className="p-4 sm:p-6">
          {conversation.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Esta conversación todavía no tiene mensajes guardados.
            </p>
          ) : (
            <ul className="space-y-4">
              {conversation.messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Este es el historial. Para responder, escribe desde el WhatsApp de la
        tienda en tu celular como siempre: lo que contestes aparece aquí solo.
      </p>
    </>
  );
}
