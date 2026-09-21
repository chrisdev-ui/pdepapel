import { OrderSource, OrderStatus, OrderType } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import { parseCartMetadata, resolveCart, type ConversationCart } from "@/lib/conversations";
import { calculateOrderTotals } from "@/lib/order-totals";
import prismadb from "@/lib/prismadb";
import { generateOrderNumber } from "@/lib/utils";

/**
 * Convierte el carrito que una clienta armó desde el catálogo de WhatsApp en
 * un pedido en BORRADOR, para que la dueña lo termine en la pantalla de
 * Pedidos de siempre.
 *
 * Nace en BORRADOR a propósito: llega sin dirección, sin envío y sin pago, y
 * un borrador no exige esos datos ni toca el inventario. Así el carrito queda
 * convertido en algo real sin ensuciar Pedidos con ventas a medias ni mover
 * existencias antes de tiempo.
 *
 * Los precios son los de HOY, no los que la clienta vio: el panel ya le avisa
 * a la dueña cuáles cambiaron antes de que confirme nada.
 */

export interface CartOrderResult {
  orderId: string;
  /** `true` cuando la conversación ya tenía un pedido y se devuelve ese mismo. */
  existing: boolean;
  cart?: ConversationCart;
}

/** Último mensaje de la conversación que traiga un carrito legible. */
export async function findLatestCart(storeId: string, conversationId: string) {
  const conversation = await prismadb.conversation.findFirst({
    where: { id: conversationId, storeId },
    select: {
      id: true,
      phone: true,
      contactName: true,
      orderId: true,
      messages: {
        orderBy: { createdAt: "desc" },
        select: { id: true, metadata: true },
      },
    },
  });
  if (!conversation) return null;

  for (const message of conversation.messages) {
    const items = parseCartMetadata(message.metadata);
    if (items) return { conversation, items };
  }
  return { conversation, items: null };
}

export async function createOrderFromConversationCart(input: {
  storeId: string;
  conversationId: string;
  /** Clerk id de la dueña: marca el pedido como creado desde el panel. */
  createdBy: string;
}): Promise<CartOrderResult> {
  const found = await findLatestCart(input.storeId, input.conversationId);
  if (!found) throw ErrorFactory.NotFound("La conversación no existe en esta tienda");

  const { conversation, items } = found;

  // Ya se creó antes: se devuelve el mismo pedido en vez de duplicarlo.
  if (conversation.orderId) {
    return { orderId: conversation.orderId, existing: true };
  }
  if (!items) {
    throw ErrorFactory.InvalidRequest(
      "Esta conversación no tiene un carrito del catálogo para convertir en pedido",
    );
  }

  const products = await prismadb.product.findMany({
    where: { storeId: input.storeId, sku: { in: items.map((item) => item.sku) } },
    select: { id: true, name: true, sku: true, price: true, stock: true, isArchived: true },
  });
  const cart = resolveCart(items, products);
  const usable = cart.lines.filter((line) => line.product !== null);
  if (usable.length === 0) {
    throw ErrorFactory.InvalidRequest(
      "Ninguno de los productos del carrito sigue en el catálogo",
    );
  }

  const images = await prismadb.image.findMany({
    where: { productId: { in: usable.map((line) => line.product!.id) } },
    orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
    select: { productId: true, url: true },
  });
  const mainImage = new Map<string, string>();
  for (const image of images) {
    if (!image.productId || !image.url) continue;
    if (!mainImage.has(image.productId)) mainImage.set(image.productId, image.url);
  }

  const totals = calculateOrderTotals(
    usable.map((line) => ({ product: { price: line.product!.price }, quantity: line.quantity })),
  );

  const order = await prismadb.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        storeId: input.storeId,
        orderNumber: generateOrderNumber(),
        type: OrderType.STANDARD,
        // Borrador: sin dirección ni pago todavía, y sin tocar inventario.
        status: OrderStatus.DRAFT,
        source: OrderSource.WHATSAPP,
        createdBy: input.createdBy,
        fullName: conversation.contactName?.trim() || "Clienta de WhatsApp",
        // Un borrador necesita un teléfono: `Order.phone` es la llave con la
        // que Clientes agrupa. Si la conversación todavía no lo tiene —clienta
        // con nombre de usuario—, se deja vacío en vez de guardar el BSUID,
        // que no es un número y ensuciaría el agrupado y los enlaces de
        // WhatsApp. Paula lo completa al cerrar el pedido.
        phone: conversation.phone ?? "",
        subtotal: totals.subtotal,
        total: totals.total,
        orderItems: {
          create: usable.map((line) => ({
            productId: line.product!.id,
            quantity: line.quantity,
            name: line.product!.name,
            sku: line.sku,
            price: line.product!.price,
            imageUrl: mainImage.get(line.product!.id) ?? "",
          })),
        },
      },
      select: { id: true },
    });

    // La conversación queda ligada al pedido que produjo.
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { orderId: created.id },
    });

    return created;
  });

  return { orderId: order.id, existing: false, cart };
}
