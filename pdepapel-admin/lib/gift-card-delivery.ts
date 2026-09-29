import { GiftCardDelivery } from "@/emails/gift-card-delivery";
import type { IssuedGiftCard } from "@/lib/gift-cards";
import { recordFailedNotification } from "@/lib/notification-failures";
import prismadb from "@/lib/prismadb";
import { currencyFormatter } from "@/lib/utils";

/**
 * Manda el correo con el código de una tarjeta recién emitida o reemitida.
 *
 * Corre DESPUÉS de que la transacción que emitió la tarjeta confirmó: el
 * código solo existe en memoria en ese momento, así que este correo es la
 * única entrega. Si falla, queda registrado (`gift-card:deliver`) y desde
 * el panel se reemite: un código nuevo, un correo nuevo. Nunca se guarda
 * el código para reintentar.
 */
export async function deliverGiftCard(
  issued: IssuedGiftCard,
  context: { buyerName?: string | null; reissued?: boolean } = {},
): Promise<boolean> {
  const { card, code, deliverTo } = issued;
  if (!code || !deliverTo) return false;

  const toBuyer = !card.recipientEmail || deliverTo === (card.buyerEmail || "").toLowerCase();
  const recipientName = toBuyer
    ? context.buyerName || card.recipientName || ""
    : card.recipientName || "";
  const buyerName = context.buyerName || "Alguien";
  const amount = currencyFormatter(card.balance);

  if (process.env.NODE_ENV === "development") {
    console.log(
      `[EMAIL] Skipping gift card delivery in development for card ****${card.codeLast4} to ${deliverTo}`,
    );
    return true;
  }

  try {
    // Carga perezosa: el cliente de Resend valida el entorno al importarse y
    // los webhooks se prueban sin él.
    const { resend } = await import("@/lib/resend");
    await resend.emails.send({
      from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
      to: [deliverTo],
      subject: context.reissued
        ? `Código nuevo para tu tarjeta de regalo de ${amount}`
        : toBuyer
          ? `Tu tarjeta de regalo de ${amount} está lista`
          : `${buyerName} te envió una tarjeta de regalo de ${amount}`,
      react: GiftCardDelivery({
        recipientName,
        buyerName,
        amount,
        code,
        message: card.message,
        toBuyer,
        reissued: Boolean(context.reissued),
      }) as React.ReactElement,
      text: [
        context.reissued
          ? `Código nuevo para tu tarjeta de regalo de ${amount}. El anterior dejó de servir.`
          : `${buyerName} te envió una tarjeta de regalo de P de Papel por ${amount}.`,
        `Código: ${code}`,
        "Se usa en papeleriapdepapel.com al pagar, entera o por partes.",
        card.message ? `Mensaje: «${card.message}»` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    await prismadb.giftCard.update({
      where: { id: card.id },
      data: { deliveredAt: new Date() },
    });
    return true;
  } catch (error) {
    console.error("[EMAIL] Error delivering gift card:", error);
    await recordFailedNotification({
      storeId: card.storeId,
      channel: "EMAIL",
      kind: context.reissued ? "gift-card:reissue" : "gift-card:deliver",
      recipient: deliverTo,
      orderId: card.purchaseOrderId,
      error,
    });
    return false;
  }
}
