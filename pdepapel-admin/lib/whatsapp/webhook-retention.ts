import { MarketplaceProvider, MarketplaceWebhookEventStatus } from "@prisma/client";

import prismadb from "@/lib/prismadb";

/**
 * Una vez que un evento de WhatsApp queda PROCESSED, su payload ya generó las
 * filas de `Conversation`/`ConversationMessage` que importan: conservarlo más
 * allá de una ventana corta solo sirve para poder reproducirlo a mano. Por eso
 * se borra pasados 30 días. Los eventos PENDING, PROCESSING, RETRY y FAILED
 * nunca se tocan aquí: siguen intactos para que la cola los reintente o
 * alguien los revise a mano.
 */
export const WHATSAPP_WEBHOOK_EVENT_RETENTION_DAYS = 30;

export async function pruneProcessedWhatsAppWebhookEvents(
  options: { olderThanDays?: number; now?: Date } = {},
): Promise<{ deleted: number; olderThanDays: number; cutoff: Date }> {
  const olderThanDays = options.olderThanDays ?? WHATSAPP_WEBHOOK_EVENT_RETENTION_DAYS;
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000);

  const { count } = await prismadb.marketplaceWebhookEvent.deleteMany({
    where: {
      provider: MarketplaceProvider.WHATSAPP,
      status: MarketplaceWebhookEventStatus.PROCESSED,
      processedAt: { lt: cutoff },
    },
  });

  return { deleted: count, olderThanDays, cutoff };
}

/**
 * Las filas del modo sombra del bot (`WhatsAppBotShadowRun`) solo sirven para
 * el informe de 7 días: se borran a los 30. `dryRun` solo cuenta.
 */
export const WHATSAPP_BOT_SHADOW_RETENTION_DAYS = 30;

export async function pruneWhatsAppBotShadowRuns(
  options: { olderThanDays?: number; now?: Date; dryRun?: boolean } = {},
): Promise<{ deleted: number; olderThanDays: number; cutoff: Date; dryRun: boolean }> {
  const olderThanDays = options.olderThanDays ?? WHATSAPP_BOT_SHADOW_RETENTION_DAYS;
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000);
  const where = { createdAt: { lt: cutoff } };
  const deleted = options.dryRun
    ? await prismadb.whatsAppBotShadowRun.count({ where })
    : (await prismadb.whatsAppBotShadowRun.deleteMany({ where })).count;
  return { deleted, olderThanDays, cutoff, dryRun: Boolean(options.dryRun) };
}
