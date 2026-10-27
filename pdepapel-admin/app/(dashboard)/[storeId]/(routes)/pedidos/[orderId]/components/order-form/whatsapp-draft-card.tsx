import { OrderStatus } from "@prisma/client";
import { MessageCircle } from "lucide-react";

import { cn, currencyFormatter } from "@/lib/utils";

/**
 * Borrador creado con «/pedido» o desde Conversaciones: recuerda el valor
 * acordado por chat mientras Paula agrega productos, ciudad y dirección.
 */
export function WhatsAppDraftCard({
  order,
  className,
}: {
  order: { status: OrderStatus; draftOrigin?: string | null; draftAgreedAmount?: number | null; total?: number | null };
  className?: string;
}) {
  if (order.status !== OrderStatus.DRAFT || !order.draftOrigin) return null;
  const gap = order.draftAgreedAmount && order.total ? Math.round(order.total - order.draftAgreedAmount) : 0;
  const origin = order.draftOrigin === "whatsapp_command" ? "con /pedido por WhatsApp" : "desde Conversaciones";
  return (
    <section className={cn("rounded-lg border border-tint-mint bg-tint-mint/40 p-4", className)} aria-label="Borrador de WhatsApp">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        Borrador creado {origin}
      </p>
      {order.draftAgreedAmount ? (
        <p className="mt-1 text-sm">
          Valor acordado por chat (referencia): <strong>{currencyFormatter(order.draftAgreedAmount)}</strong>
          {order.total ? (
            <>
              {" · "}con precios de la tienda: <strong>{currencyFormatter(order.total)}</strong>
              {gap > 0 ? ` · ${currencyFormatter(gap)} más que lo acordado` : null}
            </>
          ) : null}
        </p>
      ) : null}
      <p className="mt-1 text-sm text-muted-foreground">
        Los productos van con el precio de la tienda; si acordaste menos, aplica un descuento (no se cambia el precio de un producto). Agrega la
        ciudad y la dirección, y pulsa «Confirmar pedido». Hasta entonces no reserva inventario ni le escribe a la clienta.
      </p>
    </section>
  );
}
