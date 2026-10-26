import type { NotificationChannel, OrderNotificationStatus, PrismaClient, WhatsAppOptInSource } from "@prisma/client";

import { canRecordChatOptIn } from "@/lib/whatsapp-opt-in";
import type { ShipmentMilestone } from "@/lib/shipment-milestones";

/**
 * Lo que ve la dueña en «Avisos a la clienta» del pedido. Sin el id de Clerk
 * de quien anotó el consentimiento ni los ids de Resend/WhatsApp: el panel no
 * los necesita y no salen del servidor.
 */
export interface OrderNotificationRowView {
  id: string;
  createdAt: Date;
  milestone: ShipmentMilestone;
  channel: NotificationChannel;
  role: string;
  status: OrderNotificationStatus;
  reason: string | null;
  resent: boolean;
}

export interface OrderNotificationsView {
  rows: OrderNotificationRowView[];
  hasGuide: boolean;
  whatsapp: {
    optInAt: Date | null;
    source: WhatsAppOptInSource | null;
    version: string | null;
    optOutAt: Date | null;
    canRecord: boolean;
    switchOn: boolean;
  };
}

export async function getOrderNotificationsView(
  db: Pick<PrismaClient, "order" | "orderNotification" | "storeSettings">,
  input: { storeId: string; orderId: string },
): Promise<OrderNotificationsView | null> {
  const order = await db.order.findFirst({
    where: { id: input.orderId, storeId: input.storeId },
    select: {
      source: true,
      phone: true,
      whatsappOptInAt: true,
      whatsappOptInSource: true,
      whatsappOptInVersion: true,
      whatsappOptOutAt: true,
      shipping: { select: { trackingCode: true } },
      conversations: { where: { channel: "WHATSAPP" }, select: { id: true }, take: 1 },
    },
  });
  if (!order) return null;
  const [rows, settings] = await Promise.all([
    db.orderNotification.findMany({
      where: { orderId: input.orderId, storeId: input.storeId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, createdAt: true, milestone: true, channel: true, role: true, status: true, reason: true, createdBy: true },
    }),
    db.storeSettings.findUnique({ where: { storeId: input.storeId }, select: { whatsappOrderUpdatesEnabled: true } }),
  ]);
  return {
    rows: rows.map(({ createdBy, ...row }) => ({ ...row, milestone: row.milestone as ShipmentMilestone, resent: Boolean(createdBy) })),
    hasGuide: Boolean(order.shipping?.trackingCode),
    whatsapp: {
      optInAt: order.whatsappOptInAt,
      source: order.whatsappOptInSource,
      version: order.whatsappOptInVersion,
      optOutAt: order.whatsappOptOutAt,
      canRecord: Boolean(order.phone?.trim()) && canRecordChatOptIn({ source: order.source, hasWhatsAppConversation: order.conversations.length > 0 }),
      switchOn: Boolean(settings?.whatsappOrderUpdatesEnabled),
    },
  };
}
