import { OrderStatus, Prisma, ShippingProvider, ShippingStatus, type PrismaClient } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import { milestoneForStatus, nextShipmentStatus, type ShipmentMilestone } from "@/lib/shipment-milestones";
import { applyShipmentStatus } from "@/lib/shipment-status-apply";
import { mapEnvioClickStatus } from "@/lib/shipment-status";

/**
 * Guías de EnvioClick sin pedido: las que se hicieron directo en envioclick.com
 * (ventas cerradas por WhatsApp) y cuyos avisos llegan al webhook sin un envío
 * que les corresponda (`ShippingWebhookEvent` con `shipping_not_found`).
 * Vincular una a un pedido le da avisos a la clienta, inventario y finanzas;
 * descartarla (guía de prueba, anulada) la saca de la lista para siempre.
 */

export const ORPHAN_REASON = "shipping_not_found";

interface WebhookEventPayload {
  carrier?: unknown;
  trackingCode?: unknown;
  events?: Array<{ status?: unknown; statusStep?: unknown; timestamp?: unknown; description?: unknown; statusDetail?: unknown }>;
}

export interface OrphanGuide {
  idOrder: string;
  carrier: string | null;
  trackingCode: string | null;
  /** El estado más reciente que reportó EnvioClick, ya traducido. */
  status: ShippingStatus;
  firstSeenAt: Date;
  lastSeenAt: Date;
  notices: number;
}

type Db = Pick<PrismaClient, "shippingWebhookEvent">;

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

function payloadEvents(payload: unknown) {
  const events = (payload as WebhookEventPayload | null)?.events;
  return Array.isArray(events) ? events : [];
}

/** El estado de una guía a partir de todos sus avisos, en orden y solo hacia adelante. */
export function statusFromPayloads(payloads: unknown[], start: ShippingStatus = ShippingStatus.Preparing): ShippingStatus {
  const events = payloads
    .flatMap(payloadEvents)
    .map((event) => ({ raw: text(event.statusStep) ?? text(event.status), at: new Date(String(event.timestamp ?? "")).getTime() }))
    .filter((event) => event.raw && Number.isFinite(event.at))
    .sort((a, b) => a.at - b.at);
  return events.reduce((current, event) => nextShipmentStatus(current, mapEnvioClickStatus(event.raw, current)), start);
}

export async function listOrphanGuides(db: Db, storeId: string): Promise<OrphanGuide[]> {
  const rows = await db.shippingWebhookEvent.findMany({
    where: { storeId, reason: ORPHAN_REASON, resolvedAt: null, idOrder: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { idOrder: true, payload: true, createdAt: true },
    take: 500,
  });
  const byGuide = new Map<string, typeof rows>();
  for (const row of rows) byGuide.set(row.idOrder as string, [...(byGuide.get(row.idOrder as string) ?? []), row]);
  return Array.from(byGuide.entries())
    .map(([idOrder, list]) => {
      const latest = list[list.length - 1].payload as WebhookEventPayload;
      return {
        idOrder,
        carrier: text(latest?.carrier)?.toUpperCase() ?? null,
        trackingCode: text(latest?.trackingCode),
        status: statusFromPayloads(list.map((r) => r.payload)),
        firstSeenAt: list[0].createdAt,
        lastSeenAt: list[list.length - 1].createdAt,
        notices: list.length,
      };
    })
    .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
}

export async function countOrphanGuides(db: Db, storeId: string): Promise<number> {
  const groups = await db.shippingWebhookEvent.groupBy({
    by: ["idOrder"],
    where: { storeId, reason: ORPHAN_REASON, resolvedAt: null, idOrder: { not: null } },
  });
  return groups.length;
}

export interface LinkResult {
  orderId: string;
  orderNumber: string;
  status: ShippingStatus;
  milestone: ShipmentMilestone | null;
  stockProductIds: string[];
}

/**
 * Vincula la guía a un pedido de la tienda que todavía no tiene guía: guarda la
 * guía en su envío, repite los avisos ya recibidos para dejar el estado real
 * (y mover el pedido a «Enviado» como haría el webhook) y cierra los avisos.
 * El aviso a la clienta lo manda quien llama, después de confirmar: uno solo,
 * el del estado actual.
 */
export async function linkOrphanGuide(
  tx: Prisma.TransactionClient,
  input: { storeId: string; idOrder: string; order: { id?: string; orderNumber?: string }; userId: string },
): Promise<LinkResult> {
  const events = await tx.shippingWebhookEvent.findMany({
    where: { storeId: input.storeId, idOrder: input.idOrder, reason: ORPHAN_REASON, resolvedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, payload: true },
  });
  if (events.length === 0) throw ErrorFactory.NotFound("Esa guía ya no está en la lista de guías sin pedido.");
  const numericId = Number(input.idOrder);
  if (!Number.isSafeInteger(numericId)) throw ErrorFactory.InvalidRequest("Número de guía de EnvioClick inválido");

  const order = await tx.order.findFirst({
    where: { storeId: input.storeId, ...(input.order.id ? { id: input.order.id } : { orderNumber: input.order.orderNumber?.trim() }) },
    select: { id: true, orderNumber: true, status: true, shipping: { select: { id: true, envioClickIdOrder: true, trackingCode: true } } },
  });
  if (!order) throw ErrorFactory.NotFound("No hay un pedido con ese número en esta tienda.");
  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REJECTED) {
    throw ErrorFactory.Conflict("Ese pedido está cancelado: no se le puede vincular una guía.");
  }
  if (order.shipping?.envioClickIdOrder || order.shipping?.trackingCode) {
    throw ErrorFactory.Conflict("Ese pedido ya tiene una guía. Si es otra, cancélala primero desde el pedido.");
  }
  const taken = await tx.shipping.findFirst({ where: { envioClickIdOrder: numericId }, select: { id: true } });
  if (taken) throw ErrorFactory.Conflict("Esa guía ya está vinculada a otro pedido.");

  const latest = events[events.length - 1].payload as WebhookEventPayload;
  const guideFields = {
    provider: ShippingProvider.ENVIOCLICK,
    envioClickIdOrder: numericId,
    trackingCode: text(latest?.trackingCode),
    carrierName: text(latest?.carrier)?.toUpperCase() ?? null,
    courier: text(latest?.carrier)?.toUpperCase() ?? null,
    guideError: null,
    guideAttemptedAt: null,
  };
  const shippingId = order.shipping
    ? (await tx.shipping.update({ where: { id: order.shipping.id }, data: guideFields, select: { id: true } })).id
    : (
        await tx.shipping.create({
          data: { ...guideFields, storeId: input.storeId, orderId: order.id, status: ShippingStatus.Preparing },
          select: { id: true },
        })
      ).id;

  const status = statusFromPayloads(events.map((e) => e.payload));
  const applied = await applyShipmentStatus(tx, { shippingId, storeId: input.storeId, status, touch: true });

  for (const event of events.flatMap((e) => payloadEvents(e.payload))) {
    const raw = text(event.statusStep) ?? text(event.status);
    const at = new Date(String(event.timestamp ?? ""));
    if (!raw || Number.isNaN(at.getTime())) continue;
    const exists = await tx.shippingTrackingEvent.findFirst({ where: { shippingId, timestamp: at, status: raw }, select: { id: true } });
    if (!exists) {
      await tx.shippingTrackingEvent.create({
        data: { shippingId, status: raw, description: text(event.description) ?? text(event.statusDetail) ?? raw, timestamp: at },
      });
    }
  }

  await tx.shippingWebhookEvent.updateMany({
    where: { id: { in: events.map((e) => e.id) } },
    data: { resolvedAt: new Date(), resolvedBy: input.userId, resolution: "LINKED", linkedOrderId: order.id },
  });

  return { orderId: order.id, orderNumber: order.orderNumber, status, milestone: milestoneForStatus(status), stockProductIds: applied?.stockProductIds ?? [] };
}

/** Descartar: guía de prueba o anulada. Los avisos nuevos de esa guía llegan ya cerrados. */
export async function dismissOrphanGuide(db: Db, input: { storeId: string; idOrder: string; userId: string }): Promise<number> {
  const { count } = await db.shippingWebhookEvent.updateMany({
    where: { storeId: input.storeId, idOrder: input.idOrder, reason: ORPHAN_REASON, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedBy: input.userId, resolution: "DISMISSED" },
  });
  if (count === 0) throw ErrorFactory.NotFound("Esa guía ya no está en la lista de guías sin pedido.");
  return count;
}

/** ¿Esta guía ya se descartó? El webhook guarda sus avisos nuevos como cerrados. */
export async function isDismissedGuide(db: Db, input: { storeId: string | null; idOrder: string | null }): Promise<boolean> {
  if (!input.idOrder) return false;
  const found = await db.shippingWebhookEvent.findFirst({
    where: { idOrder: input.idOrder, resolution: "DISMISSED", ...(input.storeId ? { storeId: input.storeId } : {}) },
    select: { id: true },
  });
  return Boolean(found);
}
