import { Gift } from "lucide-react";

import type { Order } from "@/types";

/**
 * «Es un regalo para X»: quien compra ve para quién es y qué le llega a esa
 * persona (un aviso sin productos ni precios). Nada si no es regalo.
 */
export function OrderGiftNotice({
  order,
}: {
  order: Pick<Order, "isGift" | "giftRecipientName" | "giftMessage" | "type">;
}) {
  // Una tarjeta de regalo tiene su propio aviso: no hay guía ni paquete.
  if (order.type === "GIFT_CARD") return null;
  if (!order.isGift || !order.giftRecipientName) return null;

  return (
    <div
      role="note"
      className="flex max-w-2xl items-start gap-3 rounded-xl border border-pink-shell/40 bg-pink-froly/10 p-3 text-sm text-blue-yankees"
    >
      <Gift className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p>
          <strong>Es un regalo para {order.giftRecipientName}.</strong> La guía
          sale a su nombre y, cuando el pago esté confirmado, le llega un aviso
          sin productos ni precios.
        </p>
        {order.giftMessage ? (
          <p className="text-muted-foreground">
            Tu mensaje: <em>«{order.giftMessage}»</em>
          </p>
        ) : null}
      </div>
    </div>
  );
}
