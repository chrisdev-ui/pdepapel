import { Gift, MailCheck } from "lucide-react";

import { Currency } from "@/components/ui/currency";
import type { Order } from "@/types";

/**
 * Compra de una tarjeta de regalo: para quién es, cuánto vale y por dónde
 * llega. El código nunca se muestra aquí: solo viaja en el correo.
 */
export function OrderGiftCardPurchaseNotice({
  order,
}: {
  order: Pick<Order, "type" | "status" | "giftCardPurchase" | "giftRecipientName" | "email">;
}) {
  if (order.type !== "GIFT_CARD") return null;
  const card = order.giftCardPurchase;
  const recipient = card?.recipientName || order.giftRecipientName;
  const delivered = Boolean(card?.deliveredAt);

  return (
    <div
      role="note"
      className="flex max-w-2xl items-start gap-3 rounded-xl border border-pink-shell/40 bg-pink-froly/10 p-3 text-sm text-blue-yankees"
    >
      {delivered ? (
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <Gift className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <div className="space-y-1">
        <p>
          <strong>
            Tarjeta de regalo
            {card ? (
              <>
                {" "}
                de <Currency value={card.initialAmount} className="text-sm font-bold" />
              </>
            ) : null}
            {recipient ? ` para ${recipient}` : ""}.
          </strong>{" "}
          {delivered
            ? `El código ya salió por correo${card ? ` y termina en ${card.codeLast4}` : ""}. No aparece en esta página: guarda ese correo.`
            : "El código sale por correo en cuanto el pago esté confirmado. No aparece en esta página."}
        </p>
      </div>
    </div>
  );
}
