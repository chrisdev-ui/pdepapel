import { createHash, randomInt } from "node:crypto";

import { amountToCollect } from "@/lib/cod-fee";
import { createGuideWithRate, type GuideRate } from "@/lib/guide-with-rate";
import { describeGuideBlock } from "@/lib/order-transitions";
import prismadb from "@/lib/prismadb";
import { consumeRateLimit } from "@/lib/rate-limit";
import { SHIPPING_WITHOUT_GUIDE_PDF } from "@/lib/shipping-guide-pdf";
import { requoteCartShipping } from "@/lib/shipping-helpers";
import { reconcileShippingRate } from "@/lib/shipping-rate-reconcile";
import { contactLabel, type DraftCommandArgs } from "@/lib/whatsapp/admin-commands";
import { createWhatsAppDraftOrder } from "@/lib/whatsapp/draft-orders";

/**
 * Lo que hacen «/pedido», «/guia» y «/confirmar». Se carga perezoso desde la
 * bitácora de comandos: el procesador de WhatsApp no arrastra el envío ni
 * EnvioClick salvo cuando hay uno de estos comandos.
 *
 * Los textos llevan número de pedido y «…1234» o «@ma…», nunca el nombre ni
 * el teléfono completo de la clienta: el aviso se ve con el celular bloqueado.
 */

export const GUIDE_CODE_TTL_MS = 10 * 60 * 1000;
export const GUIDE_CODE_MAX_ATTEMPTS = 3;
/** Crear guías cobra: como mucho 5 cotizaciones por WhatsApp por hora y tienda. */
export const GUIDE_QUOTES_PER_HOUR = 5;

export interface ActionAnswer {
  status: "DONE" | "AWAITING_CONFIRM" | "FAILED";
  outcome: string;
  /** Lo que va en el aviso push. */
  reply: string;
  /** Lo que queda en la bitácora (sin el código de `/guia`). */
  logReply?: string;
  orderId?: string | null;
  url: string;
  /** Campos extra para la fila (código, vencimiento, tarifa). */
  extra?: Record<string, unknown>;
}

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CO")}`;
const orderUrl = (storeId: string, orderId: string) => `/${storeId}/pedidos/${orderId}`;
const logUrl = (storeId: string) => `/${storeId}/conversaciones/comandos`;

export const hashGuideCode = (rowId: string, code: string) => createHash("sha256").update(`${rowId}:${code}`).digest("hex");

const DRAFT_ERRORS: Record<NonNullable<DraftCommandArgs["error"]>, string> = {
  missing_contact: "Falta el celular o el @usuario de la clienta. Ej.: /pedido 300 123 4567 30 mil agenda stitch",
  bad_phone: "Ese celular no es colombiano de 10 dígitos (3xx). Ej.: /pedido 300 123 4567 30 mil",
  missing_amount: "Falta el valor (entre $1.000 y $10.000.000). Ej.: /pedido 300 123 4567 30 mil",
};

export async function runDraftCommand(storeId: string, draft: DraftCommandArgs | undefined): Promise<ActionAnswer> {
  const url = logUrl(storeId);
  if (!draft || draft.error) {
    return { status: "DONE", outcome: draft?.error ?? "missing_contact", reply: DRAFT_ERRORS[draft?.error ?? "missing_contact"], url };
  }
  const store = await prismadb.store.findUniqueOrThrow({ where: { id: storeId }, select: { userId: true } });
  const created = await createWhatsAppDraftOrder({
    storeId,
    origin: "whatsapp_command",
    // El chat consigo misma es el de la dueña y el comando no trae sesión.
    createdBy: store.userId,
    phone: draft.phoneTail,
    username: draft.username,
    amount: draft.amount,
    note: draft.note,
  });
  const who = contactLabel(draft);
  const link =
    created.link === "linked"
      ? "Quedó ligado a su chat."
      : created.link === "conversation_busy"
        ? "Su chat ya tiene otro pedido; este borrador queda aparte."
        : draft.username
          ? "No encontré un chat con ese usuario; el borrador queda sin chat."
          : "No encontré un chat con ese número; el borrador queda sin chat.";
  return {
    status: "DONE",
    outcome: `draft_${created.link}`,
    reply: `Borrador ${created.orderNumber} creado para ${who} por ${money(draft.amount!)} → completar en el panel (productos a precio de la tienda; si acordaste menos, con descuento). ${link}`,
    orderId: created.orderId,
    url: orderUrl(storeId, created.orderId),
  };
}

type GuideOrder = NonNullable<Awaited<ReturnType<typeof loadGuideOrder>>>;

async function loadGuideOrder(storeId: string, orderNumber: string) {
  return prismadb.order.findFirst({
    where: { storeId, orderNumber },
    include: { shipping: SHIPPING_WITHOUT_GUIDE_PDF, orderItems: true },
  });
}

/** Las mismas reglas que «Recotizar y crear guía» en el panel. `null` si se puede. */
function guideBlockOf(order: GuideOrder): string | null {
  if (!order.shipping) return "El pedido no tiene envío.";
  const block = describeGuideBlock(order.status, order.shipping.isCOD);
  if (block) return block;
  if (order.shipping.envioClickIdOrder) return "El pedido ya tiene una guía.";
  if (!order.daneCode || !order.address) return "Al pedido le falta la ciudad o la dirección.";
  if (!order.orderItems.some((item) => item.productId)) return "El pedido no tiene productos del catálogo para cotizar.";
  if (order.shipping.isCOD && amountToCollect(order) <= 0) return "Es contra entrega pero no hay nada que recaudar.";
  return null;
}

/** «/guia <pedido>», paso 1: valida, cotiza y da un código de 4 cifras que vence en 10 min. */
export async function runGuideQuote(input: { storeId: string; rowId: string; orderNumber: string | null; now: Date }): Promise<ActionAnswer> {
  const url = logUrl(input.storeId);
  if (!input.orderNumber) return { status: "DONE", outcome: "missing_order", reply: "Falta el número de pedido. Ej.: /guia ORD-1791998787841-915", url };
  const order = await loadGuideOrder(input.storeId, input.orderNumber);
  if (!order) return { status: "DONE", outcome: "order_not_found", reply: `No encuentro el pedido ${input.orderNumber}.`, url };
  const block = guideBlockOf(order);
  if (block) return { status: "DONE", outcome: "guide_blocked", reply: `${order.orderNumber}: ${block}`, orderId: order.id, url: orderUrl(input.storeId, order.id) };

  const limited = await consumeRateLimit({ key: `wa-guia:${input.storeId}`, limit: GUIDE_QUOTES_PER_HOUR, windowSeconds: 3600 });
  if (!limited.allowed) {
    return { status: "DONE", outcome: "guide_rate_limited", reply: `Más de ${GUIDE_QUOTES_PER_HOUR} cotizaciones de guía en una hora: créala desde el panel.`, orderId: order.id, url: orderUrl(input.storeId, order.id) };
  }

  const shipping = order.shipping!;
  const isCOD = Boolean(shipping.isCOD);
  const quoted = await requoteCartShipping({
    storeId: input.storeId,
    items: order.orderItems.filter((item) => item.productId).map((item) => ({ productId: item.productId!, quantity: item.quantity })),
    destination: { daneCode: order.daneCode!, address: order.address ?? "" },
    contentValue: order.total,
    ...(isCOD && { cod: { value: amountToCollect(order) } }),
  });
  const freshRates = isCOD ? quoted.filter((rate) => rate.isCOD) : quoted;
  const reconciled = freshRates.length
    ? reconcileShippingRate({
        rateId: shipping.envioClickIdRate ?? 0,
        previousCost: shipping.cost ?? null,
        previousCarrier: shipping.carrierName,
        previousProduct: shipping.productName,
        freshRates,
      })
    : null;
  if (!reconciled || reconciled.outcome === "unavailable") {
    return {
      status: "DONE",
      outcome: "guide_unavailable",
      reply: `${order.orderNumber}: la transportadora no cubre ese destino ahora. Elige otra en el panel.`,
      orderId: order.id,
      url: orderUrl(input.storeId, order.id),
    };
  }
  // Un cambio de precio no frena: el código es la confirmación, y el aviso dice el precio nuevo.
  const rate: GuideRate = {
    idRate: reconciled.rate.idRate,
    carrier: reconciled.rate.carrier,
    product: reconciled.rate.product,
    totalCost: reconciled.rate.totalCost,
    flete: reconciled.rate.flete,
    minimumInsurance: reconciled.rate.minimumInsurance,
  };
  const code = String(randomInt(0, 10_000)).padStart(4, "0");
  const changed = reconciled.outcome === "price_changed" ? ` (antes ${money(reconciled.previousCost)})` : "";
  const reply = (shown: string) =>
    `${order.orderNumber}: ${rate.carrier} ${money(rate.totalCost)}${changed}${isCOD ? ", contra entrega" : ""}. Para crear la guía escribe /confirmar ${shown} (vence en 10 min).`;
  return {
    status: "AWAITING_CONFIRM",
    outcome: "guide_quoted",
    reply: reply(code),
    logReply: reply("····"),
    orderId: order.id,
    url: orderUrl(input.storeId, order.id),
    extra: {
      codeHash: hashGuideCode(input.rowId, code),
      codeExpiresAt: new Date(input.now.getTime() + GUIDE_CODE_TTL_MS),
      codeAttempts: 0,
      quote: rate as unknown as object,
    },
  };
}

/**
 * «/confirmar <código>», paso 2. Prueba el código contra las «/guia» vivas de
 * la tienda; un fallo suma un intento a la más reciente y al tercero la anula.
 * La que acierta se toma en una sola sentencia (AWAITING_CONFIRM →
 * CONFIRMING) antes de llamar a EnvioClick: dos «/confirmar» no crean dos guías.
 */
export async function runGuideConfirm(input: { storeId: string; code: string | null | undefined; now: Date }): Promise<ActionAnswer> {
  const url = logUrl(input.storeId);
  if (!input.code) return { status: "DONE", outcome: "missing_code", reply: "Escribe /confirmar y las 4 cifras que te llegaron con /guia.", url };

  // Las vencidas se cierran: así no cuentan como pendientes.
  await prismadb.whatsAppAdminCommand.updateMany({
    where: { storeId: input.storeId, command: "guia", status: "AWAITING_CONFIRM", codeExpiresAt: { lte: input.now } },
    data: { status: "EXPIRED", codeHash: null },
  });
  const pending = await prismadb.whatsAppAdminCommand.findMany({
    where: { storeId: input.storeId, command: "guia", status: "AWAITING_CONFIRM", codeExpiresAt: { gt: input.now } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, orderId: true, codeHash: true, codeAttempts: true, quote: true },
  });
  if (pending.length === 0) {
    // Un «/confirmar» repetido que llega cuando el primero ya la tomó: decirle «pide /guia otra vez» invitaría a una segunda guía.
    const inFlight = await prismadb.whatsAppAdminCommand.count({ where: { storeId: input.storeId, command: "guia", status: "CONFIRMING", codeExpiresAt: { gt: new Date(input.now.getTime() - 5 * 60_000) } } });
    if (inFlight > 0) return { status: "DONE", outcome: "claimed_elsewhere", reply: "Esa guía ya se está creando.", url };
    return { status: "DONE", outcome: "no_pending_guide", reply: "No hay ninguna guía esperando confirmación (o el código venció). Pide /guia otra vez.", url };
  }
  const match = pending.find((row) => row.codeHash && row.codeHash === hashGuideCode(row.id, input.code!));
  if (!match) {
    const newest = pending[0];
    const attempts = newest.codeAttempts + 1;
    const exhausted = attempts >= GUIDE_CODE_MAX_ATTEMPTS;
    await prismadb.whatsAppAdminCommand.update({
      where: { id: newest.id },
      data: exhausted ? { codeAttempts: attempts, status: "EXPIRED", codeHash: null, outcome: "too_many_attempts" } : { codeAttempts: attempts },
    });
    return exhausted
      ? { status: "DONE", outcome: "too_many_attempts", reply: "Tres códigos equivocados: esa cotización se anuló. Pide /guia otra vez.", url }
      : { status: "DONE", outcome: "wrong_code", reply: `Código equivocado. Te quedan ${GUIDE_CODE_MAX_ATTEMPTS - attempts} intento${GUIDE_CODE_MAX_ATTEMPTS - attempts === 1 ? "" : "s"}.`, url };
  }

  // Una sola sentencia: con relationMode "prisma", updateMany lee y luego escribe, y dos «/confirmar» a la vez pasaban los dos.
  const claimed = await prismadb.$executeRaw`UPDATE \`WhatsAppAdminCommand\` SET \`status\` = 'CONFIRMING', \`codeHash\` = NULL WHERE \`id\` = ${match.id} AND \`status\` = 'AWAITING_CONFIRM'`;
  if (claimed !== 1) return { status: "DONE", outcome: "claimed_elsewhere", reply: "Esa guía ya se está creando.", url };

  const finish = async (status: string, outcome: string) =>
    prismadb.whatsAppAdminCommand.update({ where: { id: match.id }, data: { status, outcome, doneAt: new Date() } });

  try {
    const order = match.orderId
      ? await prismadb.order.findFirst({ where: { id: match.orderId, storeId: input.storeId }, include: { shipping: SHIPPING_WITHOUT_GUIDE_PDF, orderItems: true } })
      : null;
    if (!order) {
      await finish("FAILED", "order_not_found");
      return { status: "DONE", outcome: "order_not_found", reply: "El pedido de esa cotización ya no existe.", url };
    }
    // Pudo cambiar en estos minutos (cancelado, guía creada en el panel).
    const block = guideBlockOf(order);
    if (block) {
      await finish("FAILED", "guide_blocked");
      return { status: "DONE", outcome: "guide_blocked", reply: `${order.orderNumber}: ${block}`, orderId: order.id, url: orderUrl(input.storeId, order.id) };
    }
    const rate = match.quote as unknown as GuideRate;
    const result = await createGuideWithRate({ orderId: order.id, storeId: input.storeId, shippingId: order.shipping!.id, rate, source: "comando de WhatsApp" });
    await finish("DONE", "guide_created");
    return {
      status: "DONE",
      outcome: "guide_created",
      reply: `Guía creada para ${order.orderNumber}: ${rate.carrier}, guía ${result.data.tracker ?? result.data.idOrder}.`,
      orderId: order.id,
      url: orderUrl(input.storeId, order.id),
    };
  } catch (error) {
    await finish("FAILED", "error").catch(() => undefined);
    const message = error instanceof Error && error.message ? error.message : "error desconocido";
    return {
      status: "FAILED",
      outcome: "guide_error",
      reply: `No se pudo crear la guía: ${message.slice(0, 160)}. Revisa el pedido en el panel.`,
      orderId: match.orderId,
      url: match.orderId ? orderUrl(input.storeId, match.orderId) : url,
    };
  }
}
