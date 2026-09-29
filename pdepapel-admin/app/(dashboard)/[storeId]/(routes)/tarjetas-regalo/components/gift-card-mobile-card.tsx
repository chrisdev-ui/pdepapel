import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TintBadge } from "@/components/ui/tint-badge";
import { getGiftCardBadge } from "@/lib/gift-card-labels";
import { currencyFormatter } from "@/lib/utils";

import { relativeDate, type GiftCardColumn } from "./columns";

/** La tarjeta de regalo en el teléfono: lo mismo que la fila, en una tarjeta. */
export function GiftCardMobileCard({ card, storeId }: { card: GiftCardColumn; storeId: string }) {
  const badge = getGiftCardBadge(card);
  return (
    <article className="flex flex-col gap-2.5 rounded-xl border bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link href={`/${storeId}/tarjetas-regalo/${card.id}`} className="truncate text-sm font-bold text-primary">
            Termina en {card.codeLast4}
          </Link>
          <span className="truncate text-sm">
            {card.purchaseOrder.fullName}
            {card.recipientName ? ` → ${card.recipientName}` : ""}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="whitespace-nowrap text-base font-bold text-primary">{currencyFormatter(card.balance)}</span>
          {card.balance < card.initialAmount && (
            <span className="text-xs text-muted-foreground">de {currencyFormatter(card.initialAmount)}</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <TintBadge label={badge.label} tone={badge.tone} />
        {!card.deliveredAt && card.status === "ACTIVE" && <TintBadge label="Correo pendiente" tone="cream" />}
        {card.redemptions > 0 && <TintBadge label={`${card.redemptions} ${card.redemptions === 1 ? "uso" : "usos"}`} tone="sky" />}
        <span className="ml-auto text-xs text-muted-foreground">{relativeDate(card.issuedAt)}</span>
      </div>
      <Button asChild variant="soft" className="w-full">
        <Link href={`/${storeId}/tarjetas-regalo/${card.id}`}>Ver tarjeta</Link>
      </Button>
    </article>
  );
}
