import { OrderSource, OrderStatus, OrderType } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import { parseCartMetadata, resolveCart, type ConversationCart, type ConversationCartItemInput } from "@/lib/conversations";
import { calculateOrderTotals } from "@/lib/order-totals";
import { owedPresaleUnits, sellableStock } from "@/lib/presale-owed";
import prismadb from "@/lib/prismadb";
import { priceLines } from "@/lib/product-pricing";
import { currencyFormatter, generateOrderNumber } from "@/lib/utils";
import { getOrderItemBrandNames, orderItemBrandName } from "@/lib/order-item-brand";

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
 * Cada renglón cobra el menor entre lo que la clienta vio en Meta y lo que
 * cobra hoy la tienda (oferta y escalera incluidas). Si difieren, o si un SKU
 * ya no existe, queda anotado en las notas internas del pedido para Paula.
 */

/** Lo que el carrito necesita leer de cada producto; categoría y grupo, para las ofertas. */
export const CART_PRODUCT_SELECT = {
  id: true,
  name: true,
  sku: true,
  price: true,
  stock: true,
  reservedUnits: true,
  isArchived: true,
  categoryId: true,
  productGroupId: true,
} as const;

type CartProduct = {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  reservedUnits: number;
  isArchived: boolean;
  categoryId: string;
  productGroupId: string | null;
};

/**
 * Los productos del carrito con `price` = lo que cobra la tienda por unidad a
 * esas cantidades (el cálculo del checkout, `priceLines`), al peso. Si el
 * cálculo falla queda el precio de lista: nunca se inventa uno.
 */
export async function priceCartProducts<T extends CartProduct>(
  storeId: string,
  items: ConversationCartItemInput[],
  products: T[],
): Promise<T[]> {
  const bySku = new Map(products.map((product) => [product.sku, product]));
  const lines = items.flatMap((item) => {
    const product = bySku.get(item.sku);
    return product ? [{ productId: product.id, quantity: item.quantity }] : [];
  });
  const prices = new Map(products.map((product) => [product.id, Math.round(product.price)]));
  if (lines.length > 0) {
    try {
      const priced = await priceLines(storeId, lines, products);
      priced.forEach((line, id) => prices.set(id, Math.round(line.unitPrice)));
    } catch (error) {
      console.warn("[WHATSAPP_CART] No se pudo calcular el precio con ofertas; se usa el de lista", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  // `stock` sale neto de apartados y de lo cobrado en una preventa abierta: el
  // carrito avisa «sin existencias» con lo que de verdad se puede vender.
  const owed = await owedPresaleUnits(prismadb, products.map((product) => product.id));
  return products.map((product) => ({
    ...product,
    price: prices.get(product.id) ?? product.price,
    stock: sellableStock(product, owed.get(product.id)),
  }));
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** Para las notas internas: precios de Meta distintos y SKU que no se encontraron. Vacío si no hay nada. */
export function cartPriceNotes(cart: ConversationCart): string {
  const differing = cart.lines.filter((line) => line.product && line.quotedPrice !== null && line.quotedPrice !== line.product.price);
  const missing = cart.lines.filter((line) => !line.product);
  const parts: string[] = [];
  if (differing.length > 0) {
    parts.push(
      "<p>Carrito de WhatsApp: el precio de Meta no coincide con el de la tienda. Se cobra el menor.</p><ul>" +
        differing
          .map(
            (line) =>
              `<li>${escapeHtml(line.product!.name)} (${escapeHtml(line.sku)}): Meta ${currencyFormatter(line.quotedPrice!)}, tienda ${currencyFormatter(line.product!.price)}; se cobra ${currencyFormatter(line.unitPrice!)}</li>`,
          )
          .join("") +
        "</ul>",
    );
  }
  if (missing.length > 0) {
    parts.push(
      "<p>Carrito de WhatsApp: estos productos no se encontraron en el catálogo y no entraron al pedido.</p><ul>" +
        missing
          .map((line) => `<li>${escapeHtml(line.sku)} × ${line.quantity}${line.quotedPrice !== null ? ` (Meta ${currencyFormatter(line.quotedPrice)})` : ""}</li>`)
          .join("") +
        "</ul>",
    );
  }
  return parts.join("");
}

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
    select: CART_PRODUCT_SELECT,
  });
  const cart = resolveCart(items, await priceCartProducts(input.storeId, items, products));
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
    usable.map((line) => ({ product: { price: line.unitPrice! }, quantity: line.quantity })),
  );

  const order = await prismadb.$transaction(async (tx) => {
    const brandNames = await getOrderItemBrandNames(tx, usable.map((line) => line.product!.id));
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
        internalNotes: cartPriceNotes(cart) || undefined,
        orderItems: {
          create: usable.map((line) => ({
            productId: line.product!.id,
            quantity: line.quantity,
            name: line.product!.name,
            sku: line.sku,
            price: line.unitPrice!,
            imageUrl: mainImage.get(line.product!.id) ?? "",
            brandName: orderItemBrandName(brandNames, line.product!.id),
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
