import { NotificationChannel, OrderNotificationStatus, OrderStatus, Prisma, ShippingProvider, type PrismaClient } from "@prisma/client";
import { buildDedupeKey, SILENT_NOTICE_REASON } from "@/lib/shipment-notification-keys";

import { runInBackground } from "@/lib/background";
import type { DeliveryOutcome, EmailRole } from "@/lib/email-delivery";
import { normalizePhone } from "@/lib/phone";
import prismadb from "@/lib/prismadb";
import { milestoneForStatus, milestoneNotifiesAdmin, type ShipmentMilestone } from "@/lib/shipment-milestones";
import { canSendWhatsAppOrderUpdates } from "@/lib/whatsapp-opt-in";

/**
 * El único camino de los avisos de envío a la clienta (correo siempre; WhatsApp
 * solo con su consentimiento y el interruptor encendido). Lo llaman todas las
 * rutas que crean una guía o mueven un envío, siempre DESPUÉS de confirmar su
 * transacción: el aviso lee el pedido ya guardado.
 *
 * Una vez por guía: antes de mandar se inserta la fila `OrderNotification` con
 * `dedupeKey` único; si ya existe, otro proceso lo mandó o lo está mandando.
 * La clave lleva la guía, así una guía anulada y vuelta a crear avisa de nuevo.
 * «Reenviar» del panel usa `force` y una clave con sufijo propio.
 */

type Db = Pick<PrismaClient, "orderNotification" | "storeSettings">;

export interface NotifyShipmentInput {
  orderId: string;
  storeId: string;
  milestone: ShipmentMilestone;
  /** Quién lo pide, para los registros: «webhook», «guía manual»… */
  source: string;
  /** «Reenviar» desde el panel: nueva clave, mismo aviso. */
  force?: boolean;
  createdBy?: string | null;
  /**
   * «Avisar a la clienta» desmarcado: a ella no le sale nada, pero sus filas
   * quedan reclamadas como «Omitido», así un webhook posterior del mismo hito
   * no le escribe. La copia a Paula sale igual.
   */
  silent?: boolean;
}


export interface NotifyShipmentResult {
  email: Partial<Record<EmailRole, OrderNotificationStatus | "duplicate">>;
  whatsapp: OrderNotificationStatus | "duplicate" | "not_applicable";
  skipped?: string;
}

export { buildDedupeKey, SILENT_NOTICE_REASON };

const MAX_REASON = 500;


function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Reclama un aviso: true si esta llamada lo manda. */
async function claim(db: Db, data: Prisma.OrderNotificationUncheckedCreateInput): Promise<string | null> {
  try {
    const row = await db.orderNotification.create({ data, select: { id: true } });
    return row.id;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

async function settle(db: Db, id: string, status: OrderNotificationStatus, extra: { reason?: string | null; providerMessageId?: string | null } = {}) {
  await db.orderNotification.update({
    where: { id },
    data: { status, reason: extra.reason?.slice(0, MAX_REASON) ?? null, providerMessageId: extra.providerMessageId ?? null },
  });
}

function outcomeStatus(outcome: DeliveryOutcome | null | undefined): { status: OrderNotificationStatus; reason?: string; id?: string } {
  if (outcome === null) return { status: OrderNotificationStatus.SKIPPED, reason: "Sin correo de la clienta (vacío o de relleno)" };
  if (!outcome) return { status: OrderNotificationStatus.FAILED, reason: "No se intentó el envío" };
  if (outcome.ok) return { status: OrderNotificationStatus.SENT, id: outcome.id };
  return { status: OrderNotificationStatus.FAILED, reason: outcome.error };
}

export async function notifyShipmentMilestone(input: NotifyShipmentInput, deps: { db?: Db } = {}): Promise<NotifyShipmentResult> {
  const db = deps.db ?? prismadb;
  const { loadOrderForEmail, sendShipmentMilestoneEmail } = await import("@/lib/email");
  const result: NotifyShipmentResult = { email: {}, whatsapp: "not_applicable" };
  const order = await loadOrderForEmail(input.orderId);
  const shipping = order?.shipping;
  if (!order || order.storeId !== input.storeId) return { ...result, skipped: "pedido no encontrado" };
  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REJECTED) return { ...result, skipped: "pedido cancelado" };
  if (!shipping || shipping.provider === ShippingProvider.NONE) return { ...result, skipped: "sin envío" };
  if (!shipping.trackingCode) return { ...result, skipped: "sin guía" };

  const suffix = input.force ? `reenvio-${Date.now()}` : undefined;
  const base = {
    storeId: order.storeId,
    orderId: order.id,
    shippingId: shipping.id,
    milestone: input.milestone,
    trackingCode: shipping.trackingCode.slice(0, 100),
    createdBy: input.createdBy ?? null,
  };

  const roles: EmailRole[] = milestoneNotifiesAdmin(input.milestone) ? ["customer", "admin"] : ["customer"];
  const claimed: { role: EmailRole; id: string }[] = [];
  for (const role of roles) {
    const id = await claim(db, {
      ...base,
      channel: NotificationChannel.EMAIL,
      role,
      status: OrderNotificationStatus.SKIPPED,
      reason: "En curso",
      dedupeKey: buildDedupeKey({ shippingId: shipping.id, milestone: input.milestone, trackingCode: shipping.trackingCode, channel: NotificationChannel.EMAIL, role, suffix }),
    });
    if (id) claimed.push({ role, id });
    else result.email[role] = "duplicate";
  }
  if (input.silent) {
    for (const { role, id } of claimed.filter((c) => c.role === "customer")) {
      await settle(db, id, OrderNotificationStatus.SKIPPED, { reason: SILENT_NOTICE_REASON });
      result.email[role] = OrderNotificationStatus.SKIPPED;
    }
  }
  const toSend = input.silent ? claimed.filter((c) => c.role !== "customer") : claimed;
  if (toSend.length > 0) {
    const outcomes = await sendShipmentMilestoneEmail(
      order,
      input.milestone,
      toSend.map((c) => c.role),
    );
    for (const { role, id } of toSend) {
      const settled = outcomeStatus(outcomes[role]);
      await settle(db, id, settled.status, { reason: settled.reason, providerMessageId: settled.id });
      result.email[role] = settled.status;
    }
  }

  result.whatsapp = await notifyByWhatsApp(db, order, input, base, suffix);
  console.log(
    `[SHIPMENT_NOTIFY] ${input.source} pedido #${order.orderNumber} ${input.milestone}: ${Object.entries(result.email).map(([r, s]) => `${r}=${s}`).join(", ") || "sin correo"}, whatsapp=${result.whatsapp}`,
  );
  return result;
}

type LoadedOrder = NonNullable<Awaited<ReturnType<typeof import("@/lib/email")["loadOrderForEmail"]>>>;

async function notifyByWhatsApp(
  db: Db,
  order: LoadedOrder,
  input: NotifyShipmentInput,
  base: Omit<Prisma.OrderNotificationUncheckedCreateInput, "channel" | "role" | "status" | "dedupeKey">,
  suffix: string | undefined,
): Promise<NotifyShipmentResult["whatsapp"]> {
  const settings = await db.storeSettings.findUnique({
    where: { storeId: order.storeId },
    select: {
      whatsappOrderUpdatesEnabled: true,
      whatsappTemplateGuide: true,
      whatsappTemplateDelivered: true,
      whatsappTemplateInTransit: true,
      whatsappTemplateOutForDelivery: true,
      whatsappTemplateIssue: true,
    },
  });
  const templateName = settings ? templateNameFor(input.milestone, settings) : null;
  if (!templateName || !canSendWhatsAppOrderUpdates({ settings, order })) return "not_applicable";
  const phone = normalizePhone(order.phone).replace(/\D/g, "");
  if (!phone) return "not_applicable";

  const id = await claim(db, {
    ...base,
    channel: NotificationChannel.WHATSAPP,
    role: "customer",
    status: OrderNotificationStatus.SKIPPED,
    reason: "En curso",
    dedupeKey: buildDedupeKey({
      shippingId: base.shippingId as string,
      milestone: input.milestone,
      trackingCode: order.shipping?.trackingCode ?? null,
      channel: NotificationChannel.WHATSAPP,
      role: "customer",
      suffix,
    }),
  });
  if (!id) return "duplicate";
  if (input.silent) {
    await settle(db, id, OrderNotificationStatus.SKIPPED, { reason: SILENT_NOTICE_REASON });
    return OrderNotificationStatus.SKIPPED;
  }

  const { sendWhatsAppTemplateMessage } = await import("@/lib/whatsapp/send");
  const { buildOrderUpdateTemplate, missingTemplateParams } = await import("@/lib/whatsapp-order-templates");
  const template = buildOrderUpdateTemplate(templateName, input.milestone, order);
  // Meta rechaza una plantilla con un dato vacío: no se manda, el correo ya salió.
  const missing = missingTemplateParams(input.milestone, template.bodyParams);
  if (missing.length > 0) {
    const reason = `Falta ${missing.join(", ")} en la plantilla; solo se mandó el correo`;
    console.warn(`[SHIPMENT_NOTIFY] pedido #${order.orderNumber} ${input.milestone}: ${reason}`);
    await settle(db, id, OrderNotificationStatus.SKIPPED, { reason });
    return OrderNotificationStatus.SKIPPED;
  }
  // Sin reintento: un reintento a ciegas le llegaría dos veces (lib/whatsapp/send.ts). El correo ya salió.
  const sent = await sendWhatsAppTemplateMessage(phone, template);
  if (sent.ok) {
    await settle(db, id, OrderNotificationStatus.SENT, { providerMessageId: sent.externalId || null });
    return OrderNotificationStatus.SENT;
  }
  await settle(db, id, OrderNotificationStatus.FAILED, { reason: `${sent.code ? `(#${sent.code}) ` : ""}${sent.error}` });
  return OrderNotificationStatus.FAILED;
}

type TemplateNames = {
  whatsappTemplateGuide: string | null;
  whatsappTemplateDelivered: string | null;
  whatsappTemplateInTransit: string | null;
  whatsappTemplateOutForDelivery: string | null;
  whatsappTemplateIssue: string | null;
};

/** El nombre de la plantilla de cada hito; vacío = ese hito va solo por correo. */
export function templateNameFor(milestone: NotifyShipmentInput["milestone"], names: TemplateNames): string | null {
  const name = {
    guia_creada: names.whatsappTemplateGuide,
    en_camino: names.whatsappTemplateInTransit,
    en_reparto: names.whatsappTemplateOutForDelivery,
    entregado: names.whatsappTemplateDelivered,
    novedad: names.whatsappTemplateIssue,
  }[milestone];
  return name?.trim() || null;
}

/** Igual que `notifyShipmentMilestone`, sin retrasar la respuesta y sin que un fallo tumbe a quien llama. */
export function queueShipmentMilestone(input: NotifyShipmentInput): void {
  runInBackground(`aviso de envío ${input.milestone} (${input.source})`, async () => {
    try {
      await notifyShipmentMilestone(input);
    } catch (error) {
      console.error(`[SHIPMENT_NOTIFY] ${input.source}: no se pudo avisar ${input.milestone} del pedido ${input.orderId}:`, error);
    }
  });
}

/**
 * Avisa el hito del estado nuevo cuando un envío cambió. Para las rutas que
 * mueven estados (webhook, sincronización, edición en lote, rastreo manual).
 */
export function queueShipmentStatusChange(input: {
  orderId: string;
  storeId: string;
  previous: string;
  next: string;
  source: string;
  silent?: boolean;
  createdBy?: string | null;
}): void {
  if (input.previous === input.next) return;
  const milestone = milestoneForStatus(input.next as Parameters<typeof milestoneForStatus>[0]);
  if (!milestone) return;
  queueShipmentMilestone({
    orderId: input.orderId,
    storeId: input.storeId,
    milestone,
    source: input.source,
    ...(input.silent ? { silent: true, createdBy: input.createdBy ?? null } : {}),
  });
}

/** Avisa los envíos que cambiaron en un lote, ya confirmado. */
export function queueAppliedShipmentChanges(
  storeId: string,
  applied: ReadonlyArray<{ orderId: string; previousStatus: string; status: string; shipmentChanged: boolean } | null | undefined>,
  source: string,
): void {
  for (const result of applied) {
    if (!result?.shipmentChanged) continue;
    queueShipmentStatusChange({ orderId: result.orderId, storeId, previous: result.previousStatus, next: result.status, source });
  }
}

/**
 * Reintento del barrido (lib/notification-retry.ts) para un correo de hito que
 * falló: vuelve a mandarlo y deja la fila del aviso en SENT si salió.
 */
export async function retryShipmentMilestoneEmail(
  orderId: string,
  milestone: ShipmentMilestone,
  roles: EmailRole[],
  deps: { db?: Db } = {},
): Promise<Partial<Record<EmailRole, DeliveryOutcome>>> {
  const db = deps.db ?? prismadb;
  const { loadOrderForEmail, sendShipmentMilestoneEmail } = await import("@/lib/email");
  const order = await loadOrderForEmail(orderId);
  if (!order) return {};
  const outcomes = await sendShipmentMilestoneEmail(order, milestone, roles, { recordFailures: false });
  const result: Partial<Record<EmailRole, DeliveryOutcome>> = {};
  for (const role of roles) {
    const outcome = outcomes[role];
    if (!outcome) continue;
    result[role] = outcome;
    if (outcome.ok) {
      await db.orderNotification.updateMany({
        where: { orderId, milestone, channel: NotificationChannel.EMAIL, role, status: OrderNotificationStatus.FAILED },
        data: { status: OrderNotificationStatus.SENT, reason: null, providerMessageId: outcome.id ?? null },
      });
    }
  }
  return result;
}
