import { PaymentMethod, Prisma, ShippingStatus } from "@prisma/client";

import { ORDER_STATUS_LABELS } from "@/lib/order-transitions";
import prismadb from "@/lib/prismadb";
import { consumeRateLimit, type RateLimitResult } from "@/lib/rate-limit";
import { sendWebPushToStore, type WebPushPayload, type WebPushResult } from "@/lib/web-push";

/**
 * Comandos escritos en el chat de WhatsApp de Paula consigo misma. Solo
 * lectura en C1: `/ayuda` y `/estado <pedido>`. La Cloud API no deja escribir
 * al propio número, así que la respuesta llega como aviso push a los aparatos
 * de la dueña y queda en Conversaciones → Comandos.
 */

/** Más viejo que esto no se ejecuta: un reenvío tardío o repetido no debe responder algo de hace rato. */
export const COMMAND_MAX_AGE_MS = 10 * 60 * 1000;
/** Un reloj adelantado se tolera; un mensaje «del futuro» no. */
const COMMAND_MAX_SKEW_MS = 2 * 60 * 1000;
export const COMMAND_RATE_LIMIT = 20;
export const COMMAND_RATE_WINDOW_SECONDS = 10 * 60;

export type AdminCommandName = "ayuda" | "estado";

export interface ParsedAdminCommand {
  /** Conocido, o la palabra tal cual (recortada) si no existe. */
  command: string;
  known: AdminCommandName | null;
  /** Número de pedido de `/estado`, ya validado. */
  orderNumber: string | null;
}

const plain = (value: string) =>
  value
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const ORDER_NUMBER = /^[a-z0-9][a-z0-9-]{2,63}$/i;

/** `null` si el texto no es un comando (no empieza con «/»). */
export function parseAdminCommand(raw: string | null | undefined): ParsedAdminCommand | null {
  const textValue = (raw ?? "").normalize("NFKC").trim();
  if (!textValue.startsWith("/")) return null;
  const [head = "", ...rest] = textValue.slice(1).trim().split(/\s+/);
  const command = plain(head).slice(0, 32);
  if (command === "ayuda" || command === "help") return { command: "ayuda", known: "ayuda", orderNumber: null };
  if (command === "estado") {
    const candidate = (rest[0] ?? "").replace(/^#/, "");
    return { command, known: "estado", orderNumber: ORDER_NUMBER.test(candidate) ? candidate.toUpperCase() : null };
  }
  // Solo una palabra corta de letras y números: lo demás no se guarda tal cual.
  return { command: /^[a-z0-9]{1,16}$/.test(command) ? command : "?", known: null, orderNumber: null };
}

export const HELP_TEXT = [
  "Comandos (escríbelos en tu chat contigo misma, nunca en el de una clienta):",
  "/estado <número de pedido>: estado, pago, guía y último movimiento. Ej.: /estado ORD-1791998787841-915",
  "/ayuda: esta lista.",
  "La respuesta llega como aviso y queda en Conversaciones → Comandos.",
].join("\n");

const unknownText = (command: string) => `No conozco «/${command}». Escribe /ayuda para ver los comandos.`;
const MISSING_ORDER_TEXT = "Falta el número de pedido. Ej.: /estado ORD-1791998787841-915";
const notFoundText = (orderNumber: string) => `No encuentro el pedido ${orderNumber}.`;
const STALE_TEXT = "Ese comando llegó con más de 10 minutos de retraso y no se ejecutó. Repítelo.";
const RATE_LIMITED_TEXT = `Más de ${COMMAND_RATE_LIMIT} comandos en 10 minutos: los siguientes no se ejecutan hasta que pase la ventana.`;

/** Sin nombre de pasarela: el pago en línea es uno solo para la dueña también. */
export function paymentLabel(method: PaymentMethod | null | undefined): string {
  switch (method) {
    case PaymentMethod.Bold:
    case PaymentMethod.Wompi:
    case PaymentMethod.PayU:
      return "Pago en línea";
    case PaymentMethod.BankTransfer:
      return "Transferencia";
    case PaymentMethod.COD:
      return "Contra entrega";
    case PaymentMethod.CASH:
      return "Efectivo";
    case PaymentMethod.GiftCard:
      return "Tarjeta de regalo";
    default:
      return "Sin método de pago";
  }
}

/** Las mismas palabras que el panel (`getReadableStatus`), sin cargar `lib/utils` y su validación de entorno en el procesador. */
const SHIPPING_LABELS: Record<ShippingStatus, string> = {
  Preparing: "Preparando envío",
  Shipped: "Enviado",
  PickedUp: "Recogido por la transportadora",
  InTransit: "En tránsito",
  OutForDelivery: "En reparto",
  Delivered: "Entregado",
  FailedDelivery: "Entrega fallida",
  Returned: "Devuelto",
  Cancelled: "Envío cancelado",
  Exception: "Novedad en el envío",
};

const bogota = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

const estadoSelect = {
  id: true,
  orderNumber: true,
  status: true,
  payment: { select: { method: true } },
  shipping: {
    select: {
      status: true,
      carrierName: true,
      courier: true,
      trackingCode: true,
      trackingEvents: { orderBy: { timestamp: "desc" }, take: 1, select: { description: true, location: true, timestamp: true } },
    },
  },
} satisfies Prisma.OrderSelect;

export type EstadoOrder = Prisma.OrderGetPayload<{ select: typeof estadoSelect }>;

/** Sin nombre, teléfono ni dirección de la clienta: el aviso se ve en la pantalla bloqueada. */
export function formatEstado(order: EstadoOrder): string {
  const lines = [`Pedido ${order.orderNumber}: ${ORDER_STATUS_LABELS[order.status]} · ${paymentLabel(order.payment?.method)}`];
  const shipping = order.shipping;
  if (!shipping) {
    lines.push("Envío: sin envío registrado");
  } else {
    const carrier = shipping.carrierName ?? shipping.courier;
    const guide = shipping.trackingCode ? `guía ${shipping.trackingCode}` : "sin guía";
    lines.push(`Envío: ${SHIPPING_LABELS[shipping.status]} · ${carrier ? `${carrier}, ` : ""}${guide}`);
    const last = shipping.trackingEvents[0];
    if (last) lines.push(`Último movimiento ${bogota.format(last.timestamp)}: ${last.description}${last.location ? ` (${last.location})` : ""}`);
  }
  return lines.join("\n");
}

export interface CommandDeps {
  now?: Date;
  push?: (storeId: string, payload: WebPushPayload) => Promise<WebPushResult>;
  rateLimit?: (input: { key: string; limit: number; windowSeconds: number }) => Promise<RateLimitResult>;
}

interface Answer {
  status: "DONE" | "STALE" | "RATE_LIMITED";
  outcome: string;
  reply: string;
  orderId?: string | null;
  url: string;
  /** Sin aviso: el límite ya avisó una vez en esta ventana. */
  silent?: boolean;
}

const logUrl = (storeId: string) => `/${storeId}/conversaciones/comandos`;

async function answer(
  row: { storeId: string; command: string; args: string | null; sentAt: Date },
  options: { backlog: boolean; now: Date; rateLimit: NonNullable<CommandDeps["rateLimit"]> },
): Promise<Answer> {
  const url = logUrl(row.storeId);
  const age = options.now.getTime() - row.sentAt.getTime();
  if (options.backlog || age > COMMAND_MAX_AGE_MS || age < -COMMAND_MAX_SKEW_MS) {
    return { status: "STALE", outcome: "stale", reply: STALE_TEXT, url, silent: options.backlog };
  }
  const limited = await options.rateLimit({ key: `wa-cmd:${row.storeId}`, limit: COMMAND_RATE_LIMIT, windowSeconds: COMMAND_RATE_WINDOW_SECONDS });
  if (!limited.allowed) {
    // Un aviso por ventana; después, silencio (queda en la bitácora).
    const notice = await options.rateLimit({ key: `wa-cmd-notice:${row.storeId}`, limit: 1, windowSeconds: COMMAND_RATE_WINDOW_SECONDS });
    return { status: "RATE_LIMITED", outcome: "rate_limited", reply: RATE_LIMITED_TEXT, url, silent: !notice.allowed };
  }
  if (row.command === "ayuda") return { status: "DONE", outcome: "ok", reply: HELP_TEXT, url };
  if (row.command !== "estado") return { status: "DONE", outcome: "unknown_command", reply: unknownText(row.command), url };
  if (!row.args) return { status: "DONE", outcome: "missing_order", reply: MISSING_ORDER_TEXT, url };
  const order = await prismadb.order.findFirst({ where: { storeId: row.storeId, orderNumber: row.args }, select: estadoSelect });
  if (!order) return { status: "DONE", outcome: "order_not_found", reply: notFoundText(row.args), url };
  return { status: "DONE", outcome: "ok", reply: formatEstado(order), orderId: order.id, url: `/${row.storeId}/pedidos/${order.id}` };
}

/**
 * Ejecuta los comandos recibidos de un evento. Cada fila se toma una sola vez
 * (RECEIVED → RUNNING en una sentencia) y nunca lanza: un fallo queda en la
 * fila como FAILED en vez de reintentar el evento y contestar dos veces.
 */
export async function runSelfChatCommands(
  storeId: string,
  echoIds: string[],
  options: { backlog?: boolean } & CommandDeps = {},
): Promise<{ ran: number }> {
  if (echoIds.length === 0) return { ran: 0 };
  const now = options.now ?? new Date();
  const push = options.push ?? ((id: string, payload: WebPushPayload) => sendWebPushToStore(id, payload));
  const rateLimit = options.rateLimit ?? consumeRateLimit;
  const rows = await prismadb.whatsAppAdminCommand.findMany({
    where: { storeId, echoId: { in: echoIds }, status: "RECEIVED" },
    orderBy: { sentAt: "asc" },
    select: { id: true, storeId: true, command: true, args: true, sentAt: true },
  });
  let ran = 0;
  for (const row of rows) {
    const claimed = await prismadb.whatsAppAdminCommand.updateMany({ where: { id: row.id, status: "RECEIVED" }, data: { status: "RUNNING" } });
    if (claimed.count !== 1) continue;
    ran += 1;
    try {
      const result = await answer(row, { backlog: Boolean(options.backlog), now, rateLimit });
      let delivered = 0;
      if (!result.silent) {
        const sent = await push(storeId, { title: `/${row.command}`, body: result.reply, url: result.url, tag: `comando-${row.id}` }).catch(() => null);
        delivered = sent?.delivered ?? 0;
      }
      await prismadb.whatsAppAdminCommand.update({
        where: { id: row.id },
        data: { status: result.status, outcome: result.outcome, reply: result.reply, orderId: result.orderId ?? null, delivered, doneAt: new Date() },
      });
    } catch (error) {
      console.error("[WHATSAPP_COMMAND] El comando falló", { commandId: row.id, message: error instanceof Error ? error.message : "unknown" });
      await prismadb.whatsAppAdminCommand
        .update({ where: { id: row.id }, data: { status: "FAILED", outcome: "error", doneAt: new Date() } })
        .catch(() => undefined);
    }
  }
  return { ran };
}

/**
 * Guarda los comandos de un cuerpo firmado (uno por eco con «/»). Un eco ya
 * guardado (reenvío de Meta) choca con `echoId` único y se salta. Devuelve
 * cuántos quedaron nuevos.
 */
export async function recordSelfChatCommands(
  storeId: string,
  echoes: Array<{ id: string | null; text: string | null; timestamp: number | null }>,
  now = new Date(),
): Promise<number> {
  let created = 0;
  for (const echo of echoes) {
    const parsed = parseAdminCommand(echo.text);
    if (!parsed || !echo.id) continue;
    try {
      await prismadb.whatsAppAdminCommand.create({
        data: {
          storeId,
          echoId: echo.id,
          command: parsed.command,
          args: parsed.orderNumber,
          sentAt: echo.timestamp ? new Date(echo.timestamp * 1000) : now,
        },
      });
      created += 1;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  return created;
}
