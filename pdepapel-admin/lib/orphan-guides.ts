import { OrderStatus, OrderType, Prisma, ShippingProvider, ShippingStatus, type PrismaClient } from "@prisma/client";

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
  previousStatus: ShippingStatus;
  status: ShippingStatus;
  milestone: ShipmentMilestone | null;
  stockProductIds: string[];
}

/**
 * El número de guía comparable: solo letras y dígitos, en mayúscula. Paula lo
 * escribe con espacios o guiones; EnvioClick lo manda corrido. Menos de 8
 * caracteres no identifica una guía y nunca casa con nada.
 */
export function normalizeTracking(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const clean = code.replace(/[^0-9a-z]/gi, "").toUpperCase();
  return clean.length >= 8 ? clean : null;
}

type OrphanEvent = { id: string; idOrder: string | null; payload: Prisma.JsonValue };

/**
 * La guía sin pedido (sin vincular ni ocultar) con ese número de guía. Solo si
 * hay exactamente una: con dos guías del mismo número no se adivina.
 */
export async function findOrphanGuideByTracking(
  db: Pick<Prisma.TransactionClient, "shippingWebhookEvent">,
  input: { storeId: string; trackingCode: string | null | undefined },
): Promise<{ idOrder: string; events: OrphanEvent[] } | null> {
  const wanted = normalizeTracking(input.trackingCode);
  if (!wanted) return null;
  const rows = await db.shippingWebhookEvent.findMany({
    where: { storeId: input.storeId, reason: ORPHAN_REASON, resolvedAt: null, idOrder: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, idOrder: true, payload: true },
    take: 500,
  });
  const matches = new Map<string, OrphanEvent[]>();
  for (const row of rows) {
    if (normalizeTracking((row.payload as WebhookEventPayload | null)?.trackingCode) !== wanted) continue;
    matches.set(row.idOrder as string, [...(matches.get(row.idOrder as string) ?? []), row]);
  }
  if (matches.size !== 1) return null;
  const [idOrder, events] = Array.from(matches.entries())[0];
  return { idOrder, events };
}

/**
 * El envío manual con ese número de guía, sin guía de EnvioClick, de un pedido
 * vivo. Solo si hay exactamente uno en el alcance (la tienda del webhook o,
 * sin tienda, todas): con dos no se adivina.
 */
export async function findManualShippingByTracking(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  input: { storeId: string | null; trackingCode: string | null | undefined },
): Promise<{ shippingId: string; orderId: string; storeId: string } | null> {
  const wanted = normalizeTracking(input.trackingCode);
  if (!wanted) return null;
  const rows = await db.$queryRaw<Array<{ shippingId: string; orderId: string; storeId: string }>>`
    SELECT s.id AS shippingId, s.orderId AS orderId, s.storeId AS storeId
    FROM \`Shipping\` s JOIN \`Order\` o ON o.id = s.orderId
    WHERE s.provider = 'MANUAL' AND s.envioClickIdOrder IS NULL AND s.trackingCode IS NOT NULL
      AND UPPER(REGEXP_REPLACE(s.trackingCode, '[^0-9A-Za-z]', '')) = ${wanted}
      AND o.status NOT IN ('CANCELLED', 'REJECTED')
      ${input.storeId ? Prisma.sql`AND s.storeId = ${input.storeId}` : Prisma.empty}
    LIMIT 2`;
  return rows.length === 1 ? rows[0] : null;
}

export interface AdoptResult {
  shippingId: string;
  previousStatus: ShippingStatus;
  status: ShippingStatus;
  stockProductIds: string[];
}

/**
 * Pasa la guía de EnvioClick al envío del pedido: proveedor EnvioClick, su id
 * y la transportadora; el estado avanza (solo hacia adelante) con los avisos
 * ya recibidos y el pedido lo sigue como con el webhook; los eventos quedan en
 * el seguimiento y los avisos huérfanos se cierran como vinculados.
 *
 * El número de guía del envío NO se toca: la llave de los avisos a la clienta
 * lleva ese texto, así «guía creada» no sale otra vez. El aviso lo manda quien
 * llama, después de confirmar (`queueShipmentStatusChange` con el estado
 * anterior y el nuevo).
 */
export async function adoptOrphanGuide(
  tx: Prisma.TransactionClient,
  input: { storeId: string; orderId: string; shippingId: string | null; idOrder: string; events: OrphanEvent[]; resolvedBy: string },
): Promise<AdoptResult> {
  const numericId = Number(input.idOrder);
  if (!Number.isSafeInteger(numericId)) throw ErrorFactory.InvalidRequest("Número de guía de EnvioClick inválido");
  const taken = await tx.shipping.findFirst({ where: { envioClickIdOrder: numericId }, select: { id: true } });
  if (taken && taken.id !== input.shippingId) throw ErrorFactory.Conflict("Esa guía ya está vinculada a otro pedido.");

  const latest = input.events[input.events.length - 1].payload as WebhookEventPayload;
  const carrier = text(latest?.carrier)?.toUpperCase() ?? null;
  const current = input.shippingId
    ? await tx.shipping.findUnique({ where: { id: input.shippingId }, select: { status: true, trackingCode: true } })
    : null;
  const guideFields = {
    provider: ShippingProvider.ENVIOCLICK,
    envioClickIdOrder: numericId,
    ...(current?.trackingCode ? {} : { trackingCode: text(latest?.trackingCode) }),
    ...(carrier ? { carrierName: carrier, courier: carrier } : {}),
    guideError: null,
    guideAttemptedAt: null,
  };
  const shippingId = input.shippingId
    ? (await tx.shipping.update({ where: { id: input.shippingId }, data: guideFields, select: { id: true } })).id
    : (
        await tx.shipping.create({
          data: { ...guideFields, storeId: input.storeId, orderId: input.orderId, status: ShippingStatus.Preparing },
          select: { id: true },
        })
      ).id;

  const previousStatus = current?.status ?? ShippingStatus.Preparing;
  const status = statusFromPayloads(input.events.map((e) => e.payload), previousStatus);
  const applied = await applyShipmentStatus(tx, { shippingId, storeId: input.storeId, status, touch: true });

  for (const event of input.events.flatMap((e) => payloadEvents(e.payload))) {
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
    where: { id: { in: input.events.map((e) => e.id) } },
    data: { resolvedAt: new Date(), resolvedBy: input.resolvedBy, resolution: "LINKED", linkedOrderId: input.orderId },
  });

  return { shippingId, previousStatus, status, stockProductIds: applied?.stockProductIds ?? [] };
}

/**
 * «Vincular» a mano: la guía va al pedido que Paula escribe. Un pedido sin
 * guía la recibe; uno con número de guía a mano solo si es el mismo número
 * (la adopta); otro número o una guía de EnvioClick ya puesta se rechazan.
 */
export async function linkOrphanGuide(
  tx: Prisma.TransactionClient,
  input: { storeId: string; idOrder: string; order: { id?: string; orderNumber?: string }; userId: string },
): Promise<LinkResult> {
  const events = await tx.shippingWebhookEvent.findMany({
    where: { storeId: input.storeId, idOrder: input.idOrder, reason: ORPHAN_REASON, resolvedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, idOrder: true, payload: true },
  });
  if (events.length === 0) throw ErrorFactory.NotFound("Esa guía ya no está en la lista de guías sin pedido.");
  if (!Number.isSafeInteger(Number(input.idOrder))) throw ErrorFactory.InvalidRequest("Número de guía de EnvioClick inválido");

  const order = await tx.order.findFirst({
    where: { storeId: input.storeId, ...(input.order.id ? { id: input.order.id } : { orderNumber: input.order.orderNumber?.trim() }) },
    select: { id: true, orderNumber: true, status: true, shipping: { select: { id: true, envioClickIdOrder: true, trackingCode: true } } },
  });
  if (!order) throw ErrorFactory.NotFound("No hay un pedido con ese número en esta tienda.");
  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REJECTED) {
    throw ErrorFactory.Conflict("Ese pedido está cancelado: no se le puede vincular una guía.");
  }
  if (order.shipping?.envioClickIdOrder) {
    throw ErrorFactory.Conflict("Ese pedido ya tiene una guía de EnvioClick. Si es otra, cancélala primero desde el pedido.");
  }
  if (order.shipping?.trackingCode) {
    const guideCode = (events[events.length - 1].payload as WebhookEventPayload | null)?.trackingCode;
    if (normalizeTracking(order.shipping.trackingCode) !== normalizeTracking(guideCode)) {
      throw ErrorFactory.Conflict("Ese pedido ya tiene otro número de guía. Si es otra guía, cámbiala primero desde el pedido.");
    }
  }

  const adopted = await adoptOrphanGuide(tx, {
    storeId: input.storeId,
    orderId: order.id,
    shippingId: order.shipping?.id ?? null,
    idOrder: input.idOrder,
    events,
    resolvedBy: input.userId,
  });
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    previousStatus: adopted.previousStatus,
    status: adopted.status,
    milestone: milestoneForStatus(adopted.status),
    stockProductIds: adopted.stockProductIds,
  };
}

export interface AutoAdoptResult extends AdoptResult {
  orderId: string;
  storeId: string;
  idOrder: string;
}

/**
 * Al guardar un número de guía a mano en un pedido: si es el de una guía de
 * EnvioClick sin pedido (hecha en envioclick.com), la adopta sola. Solo con
 * envío manual, sin guía de EnvioClick, pedido vivo y exactamente una guía con
 * ese número. El aviso lo manda quien llama, con su «Avisar a la clienta».
 */
export async function autoAdoptOrphanGuide(
  db: Pick<PrismaClient, "$transaction">,
  input: { storeId: string; orderId: string; resolvedBy: string },
): Promise<AutoAdoptResult | null> {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: input.orderId, storeId: input.storeId },
      select: { status: true, shipping: { select: { id: true, provider: true, envioClickIdOrder: true, trackingCode: true } } },
    });
    const shipping = order?.shipping;
    if (!order || !shipping || order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REJECTED) return null;
    if (shipping.provider !== ShippingProvider.MANUAL || shipping.envioClickIdOrder || !shipping.trackingCode) return null;
    const guide = await findOrphanGuideByTracking(tx, { storeId: input.storeId, trackingCode: shipping.trackingCode });
    if (!guide) return null;
    const adopted = await adoptOrphanGuide(tx, {
      storeId: input.storeId,
      orderId: input.orderId,
      shippingId: shipping.id,
      idOrder: guide.idOrder,
      events: guide.events,
      resolvedBy: input.resolvedBy,
    });
    return { ...adopted, orderId: input.orderId, storeId: input.storeId, idOrder: guide.idOrder };
  });
}

/** Quién adopta cuando nadie lo pidió: el webhook o el guardado automático. */
export const AUTO_ADOPTED_BY = "auto";

/**
 * Lo contrario: llega por webhook una guía que no es de ningún envío, pero su
 * número ya lo escribió Paula a mano en un pedido. Se adopta igual, con las
 * mismas guardas: exactamente un envío manual con ese número en el alcance del
 * webhook, sin guía de EnvioClick, pedido vivo, y la guía no está oculta.
 */
export async function adoptOrphanGuideFromWebhook(
  db: Pick<PrismaClient, "$transaction" | "$queryRaw">,
  input: { scopedStoreId: string | null; idOrder: string; trackingCode: unknown },
): Promise<AutoAdoptResult | null> {
  if (!Number.isSafeInteger(Number(input.idOrder))) return null;
  const match = await findManualShippingByTracking(db, {
    storeId: input.scopedStoreId,
    trackingCode: typeof input.trackingCode === "string" ? input.trackingCode : null,
  });
  if (!match) return null;
  return db.$transaction(async (tx) => {
    const dismissed = await tx.shippingWebhookEvent.findFirst({
      where: { idOrder: input.idOrder, resolution: "DISMISSED" },
      select: { id: true },
    });
    if (dismissed) return null;
    const events = await tx.shippingWebhookEvent.findMany({
      where: { idOrder: input.idOrder, reason: ORPHAN_REASON, resolvedAt: null, OR: [{ storeId: match.storeId }, { storeId: null }] },
      orderBy: { createdAt: "asc" },
      select: { id: true, idOrder: true, payload: true },
    });
    if (events.length === 0) return null;
    // Releer dentro de la transacción: otro guardado pudo ponerle guía mientras tanto.
    const shipping = await tx.shipping.findUnique({ where: { id: match.shippingId }, select: { provider: true, envioClickIdOrder: true } });
    if (!shipping || shipping.provider !== ShippingProvider.MANUAL || shipping.envioClickIdOrder) return null;
    const adopted = await adoptOrphanGuide(tx, {
      storeId: match.storeId,
      orderId: match.orderId,
      shippingId: match.shippingId,
      idOrder: input.idOrder,
      events,
      resolvedBy: AUTO_ADOPTED_BY,
    });
    return { ...adopted, orderId: match.orderId, storeId: match.storeId, idOrder: input.idOrder };
  });
}

export interface LinkCandidate {
  orderId: string;
  orderNumber: string;
  createdAt: Date;
  city: string | null;
  total: number;
  /** Solo las 4 últimas cifras: la lista se ve en el teléfono y no lleva datos de la clienta. */
  phoneLast4: string | null;
  /** El pedido ya tiene ese mismo número de guía escrito a mano. */
  trackingMatch: boolean;
}

const CANDIDATE_WINDOW_DAYS = 14;
const SEARCH_WINDOW_DAYS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pedidos a los que se puede vincular la guía: de la tienda, vivos, de envío
 * (ni punto de venta ni feria ni tarjeta de regalo) y sin guía, o con el mismo
 * número de guía escrito a mano. Sin búsqueda, los creados en los 14 días
 * antes del primer aviso de la guía (hasta un día después); el que tiene el
 * mismo número va primero y luego el más cercano en fecha. EnvioClick no
 * manda la ciudad de destino en sus avisos, así que no se ordena por ciudad.
 * Con búsqueda: número de pedido, nombre o últimas cifras del celular.
 */
export async function listLinkCandidates(
  db: Pick<PrismaClient, "shippingWebhookEvent" | "order">,
  input: { storeId: string; idOrder: string; query?: string | null; now?: Date },
): Promise<LinkCandidate[]> {
  const events = await db.shippingWebhookEvent.findMany({
    where: { storeId: input.storeId, idOrder: input.idOrder, reason: ORPHAN_REASON, resolvedAt: null },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, payload: true },
  });
  if (events.length === 0) throw ErrorFactory.NotFound("Esa guía ya no está en la lista de guías sin pedido.");
  const guideCode = normalizeTracking((events[events.length - 1].payload as WebhookEventPayload | null)?.trackingCode);
  const guideAt = events[0].createdAt;

  const query = input.query?.trim() ?? "";
  const digits = query.replace(/\D/g, "");
  const search: Prisma.OrderWhereInput | null = !query
    ? null
    : /^ord/i.test(query)
      ? { orderNumber: { contains: query } }
      : digits.length >= 3 && digits.length === query.replace(/[\s+()-]/g, "").length
        ? { OR: [{ phone: { endsWith: digits } }, { orderNumber: { contains: digits } }] }
        : { fullName: { contains: query } };

  const rows = await db.order.findMany({
    where: {
      storeId: input.storeId,
      status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REJECTED, OrderStatus.DRAFT] },
      type: { notIn: [OrderType.POINT_OF_SALE, OrderType.FESTIVAL, OrderType.GIFT_CARD] },
      OR: [{ shipping: null }, { shipping: { envioClickIdOrder: null, provider: { not: ShippingProvider.NONE } } }],
      ...(search
        ? { ...search, createdAt: { gte: new Date((input.now ?? new Date()).getTime() - SEARCH_WINDOW_DAYS * DAY_MS) } }
        : { createdAt: { gte: new Date(guideAt.getTime() - CANDIDATE_WINDOW_DAYS * DAY_MS), lte: new Date(guideAt.getTime() + DAY_MS) } }),
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { id: true, orderNumber: true, createdAt: true, city: true, total: true, phone: true, shipping: { select: { trackingCode: true } } },
  });

  return rows
    .map((row) => {
      const code = normalizeTracking(row.shipping?.trackingCode);
      return { row, code, trackingMatch: Boolean(code && guideCode && code === guideCode) };
    })
    // Con otro número de guía ya escrito no es de esta guía.
    .filter(({ code, trackingMatch }) => !code || trackingMatch)
    .sort((a, b) =>
      Number(b.trackingMatch) - Number(a.trackingMatch) ||
      Math.abs(a.row.createdAt.getTime() - guideAt.getTime()) - Math.abs(b.row.createdAt.getTime() - guideAt.getTime()),
    )
    .slice(0, search ? 10 : 8)
    .map(({ row, trackingMatch }) => {
      const phoneDigits = (row.phone ?? "").replace(/\D/g, "");
      return {
        orderId: row.id,
        orderNumber: row.orderNumber,
        createdAt: row.createdAt,
        city: row.city?.trim() || null,
        total: row.total,
        phoneLast4: phoneDigits.length >= 4 ? phoneDigits.slice(-4) : null,
        trackingMatch,
      };
    });
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
