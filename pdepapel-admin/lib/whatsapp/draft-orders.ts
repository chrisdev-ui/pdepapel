import { OrderSource, OrderStatus, OrderType, type Prisma } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { generateOrderNumber } from "@/lib/utils";

/**
 * Borrador de pedido desde WhatsApp: «/pedido» en el chat consigo misma o
 * «Crear pedido» en una conversación. Es un DRAFT como el del carrito: no
 * reserva inventario, no cobra, no escribe a la clienta y no cuenta en
 * ventas ni en «Por atender». Paula lo completa en el panel (productos,
 * ciudad, dirección) y lo confirma con las reglas de siempre.
 */

export type DraftOrigin = "whatsapp_command" | "conversaciones";

/** Cómo quedó ligado a la conversación: ligado, sin conversación, o la conversación ya tenía otro pedido. */
export type DraftLink = "linked" | "no_conversation" | "conversation_busy";

export interface DraftInput {
  storeId: string;
  origin: DraftOrigin;
  /**
   * Clerk id de quien lo crea. Desde el panel, la sesión; desde «/pedido», la
   * dueña de la tienda (`Store.userId`): el chat consigo misma es el suyo y el
   * comando no trae sesión.
   */
  createdBy: string;
  /** Celular de 10 dígitos (3xx…). */
  phone?: string | null;
  /** Nombre de usuario de WhatsApp, sin «@», para clientas sin teléfono visible. */
  username?: string | null;
  /** La conversación exacta (botón de Conversaciones). Gana sobre teléfono y usuario. */
  conversationId?: string | null;
  amount?: number | null;
  note?: string | null;
}

export interface DraftResult {
  orderId: string;
  orderNumber: string;
  link: DraftLink;
  /** El borrador que ya existía para esa conversación (el botón no crea dos). */
  existing: boolean;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Los últimos 10 dígitos, como la baja «BAJA»: así casa `573001234567`, `+57 300…` y `3001234567`. */
export const phoneTail10 = (value: string | null | undefined) => {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
};

/** E.164, como guarda el panel (`lib/phone.ts`); Clientes agrupa por dígitos, así que casa con `57…`. */
const toOrderPhone = (tail: string) => `+57${tail}`;

const linkable = (orderStatus: OrderStatus | null | undefined) => !orderStatus || orderStatus === OrderStatus.CANCELLED;

async function findConversation(storeId: string, input: Pick<DraftInput, "conversationId" | "phone" | "username">) {
  const select = { id: true, phone: true, username: true, contactName: true, orderId: true, order: { select: { status: true } } } as const;
  if (input.conversationId) return prismadb.conversation.findFirst({ where: { id: input.conversationId, storeId }, select });
  const tail = phoneTail10(input.phone);
  if (tail) {
    // Pocas conversaciones por tienda tienen teléfono con esa cola: se trae la más reciente.
    return prismadb.conversation.findFirst({
      where: { storeId, phone: { endsWith: tail } },
      orderBy: { lastInboundAt: "desc" },
      select,
    });
  }
  const username = input.username?.replace(/^@/, "").trim();
  if (username) {
    const matches = await prismadb.conversation.findMany({ where: { storeId, username }, take: 2, select });
    // Dos con el mismo usuario no debería pasar; si pasa, no se adivina.
    return matches.length === 1 ? matches[0] : null;
  }
  return null;
}

export async function createWhatsAppDraftOrder(input: DraftInput): Promise<DraftResult> {
  const conversation = await findConversation(input.storeId, input);
  if (input.conversationId && !conversation) throw ErrorFactory.NotFound("La conversación no existe en esta tienda");

  // El botón no crea dos: si la conversación ya tiene un pedido vivo, se abre ese.
  if (input.origin === "conversaciones" && conversation?.orderId && !linkable(conversation.order?.status)) {
    const existing = await prismadb.order.findUniqueOrThrow({ where: { id: conversation.orderId }, select: { id: true, orderNumber: true } });
    return { orderId: existing.id, orderNumber: existing.orderNumber, link: "linked", existing: true };
  }

  const tail = phoneTail10(input.phone) ?? phoneTail10(conversation?.phone);
  const username = input.username?.replace(/^@/, "").trim() || conversation?.username || null;
  const fullName = conversation?.contactName?.trim() || (username ? `@${username}` : "Clienta de WhatsApp");
  const note = input.note?.trim();
  const internalNotes = [
    input.origin === "whatsapp_command" ? "Creado por comando de WhatsApp." : "Creado desde Conversaciones.",
    input.amount ? `Valor acordado por chat: $${input.amount.toLocaleString("es-CO")}.` : null,
    note ? `Nota: ${escapeHtml(note)}` : null,
    !tail && username ? `Clienta sin teléfono visible: @${escapeHtml(username)}.` : null,
  ]
    .filter(Boolean)
    .join("<br>");

  const link: DraftLink = !conversation ? "no_conversation" : linkable(conversation.order?.status) ? "linked" : "conversation_busy";

  const run = async (client: Prisma.TransactionClient) => {
    const order = await client.order.create({
      data: {
        storeId: input.storeId,
        orderNumber: generateOrderNumber(),
        type: OrderType.STANDARD,
        status: OrderStatus.DRAFT,
        source: OrderSource.WHATSAPP,
        createdBy: input.createdBy,
        fullName,
        // Sin teléfono visible (clienta con nombre de usuario) queda vacío: Paula lo completa al confirmar.
        phone: tail ? toOrderPhone(tail) : "",
        subtotal: 0,
        total: 0,
        draftAgreedAmount: input.amount ?? null,
        draftOrigin: input.origin,
        internalNotes,
      },
      select: { id: true, orderNumber: true },
    });
    if (conversation && link === "linked") {
      await client.conversation.update({ where: { id: conversation.id }, data: { orderId: order.id } });
    }
    return order;
  };

  const order = await prismadb.$transaction(run);
  return { orderId: order.id, orderNumber: order.orderNumber, link, existing: false };
}
