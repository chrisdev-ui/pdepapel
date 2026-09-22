import {
  ConversationMessageDirection,
  ConversationMessageSentBy,
  ConversationMessageStatus,
  ConversationStatus,
} from "@prisma/client";
import { z } from "zod";

import prismadb from "@/lib/prismadb";
import {
  normalizeIgnoredBsuid,
  normalizeIgnoredPhone,
} from "@/lib/whatsapp/ignored-contacts";

/**
 * Conversaciones de WhatsApp para el panel: tipos de vista, etiquetas en
 * español y la resolución del carrito que manda una clienta desde el catálogo.
 *
 * El carrito se guarda crudo en `ConversationMessage.metadata` y se resuelve
 * aquí, al mostrarlo, contra el catálogo actual: así el precio y las
 * existencias son los de ahora y no los del día que escribió.
 */

// --- Etiquetas -------------------------------------------------------------

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  [ConversationStatus.OPEN]: "Abierta",
  [ConversationStatus.NEEDS_OWNER]: "Necesita respuesta",
  [ConversationStatus.RESOLVED]: "Resuelta",
};

export const CONVERSATION_SENT_BY_LABELS: Record<ConversationMessageSentBy, string> = {
  [ConversationMessageSentBy.CUSTOMER]: "Clienta",
  [ConversationMessageSentBy.OWNER]: "Tú",
  [ConversationMessageSentBy.BOT]: "Respuesta automática",
};

export const CONVERSATION_MESSAGE_STATUS_LABELS: Record<ConversationMessageStatus, string> = {
  [ConversationMessageStatus.RECEIVED]: "Recibido",
  [ConversationMessageStatus.QUEUED]: "En cola",
  [ConversationMessageStatus.SENT]: "Enviado",
  [ConversationMessageStatus.DELIVERED]: "Entregado",
  [ConversationMessageStatus.READ]: "Leído",
  [ConversationMessageStatus.FAILED]: "Falló",
};

/** Tipos de adjunto que manda WhatsApp, en palabras de la dueña. */
export const CONVERSATION_MEDIA_LABELS: Record<string, string> = {
  image: "Foto",
  video: "Video",
  audio: "Nota de voz",
  document: "Documento",
  sticker: "Sticker",
  reaction: "Reacción",
  location: "Ubicación",
  contacts: "Contacto",
  order: "Carrito del catálogo",
  revoke: "Mensaje eliminado",
  edit: "Mensaje editado",
};

export function describeMedia(mediaType: string | null): string | null {
  if (!mediaType) return null;
  return CONVERSATION_MEDIA_LABELS[mediaType] ?? mediaType;
}

// --- Carrito ---------------------------------------------------------------

const cartItemSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
});

const messageMetadataSchema = z.object({
  order: z
    .object({
      catalogId: z.string().nullable().optional(),
      note: z.string().nullable().optional(),
      items: z.array(cartItemSchema).min(1),
    })
    .optional(),
  /**
   * El botón o la fila que tocó la clienta. Meta manda el cuerpo del mensaje
   * igual al título del botón, así que sin esto un toque y un texto escrito se
   * ven idénticos en el panel: los 23 «Hablar con Paula» de septiembre eran
   * todos toques y parecían mecanografiados.
   */
  tap: z.object({ id: z.string().min(1) }).optional(),
});

export type ConversationCartItemInput = z.infer<typeof cartItemSchema>;

/** Lee el carrito guardado sin confiar en su forma; `null` si no hay o no se entiende. */
export function parseCartMetadata(metadata: unknown): ConversationCartItemInput[] | null {
  const parsed = messageMetadataSchema.safeParse(metadata);
  if (!parsed.success || !parsed.data.order) return null;
  return parsed.data.order.items;
}

/**
 * ¿Este mensaje llegó por un toque? Devuelve el id de lo que se tocó.
 * `owner` es el botón de escape; `r:`, `p:` y `pay:` llevan a dónde apuntaba.
 */
export function parseTapMetadata(metadata: unknown): string | null {
  const parsed = messageMetadataSchema.safeParse(metadata);
  if (!parsed.success || !parsed.data.tap) return null;
  return parsed.data.tap.id;
}

/** Un renglón del carrito ya cruzado con el catálogo. */
export interface ConversationCartLine {
  sku: string;
  quantity: number;
  /** Precio que la clienta vio en el catálogo. */
  quotedPrice: number | null;
  /** `null` cuando el SKU ya no existe en el catálogo. */
  product: {
    id: string;
    name: string;
    price: number;
    stock: number;
    isArchived: boolean;
  } | null;
}

export interface ConversationCart {
  lines: ConversationCartLine[];
  /** Suma con el precio de hoy, solo de los renglones que se pudieron resolver. */
  total: number;
  /** Renglones cuyo SKU ya no está en el catálogo. */
  unresolved: number;
  /** Renglones cuyo precio cambió desde que la clienta lo vio. */
  priceChanged: number;
  /** Renglones sin existencias suficientes hoy. */
  insufficientStock: number;
}

type CatalogProduct = {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  isArchived: boolean;
};

/**
 * Cruza los SKU del carrito con el catálogo. El feed de Meta publica el SKU
 * como id del producto, así que `product_retailer_id` entra directo aquí.
 */
export function resolveCart(
  items: ConversationCartItemInput[],
  products: CatalogProduct[],
): ConversationCart {
  const bySku = new Map(products.map((product) => [product.sku, product]));
  let total = 0;
  let unresolved = 0;
  let priceChanged = 0;
  let insufficientStock = 0;

  const lines = items.map((item) => {
    const found = bySku.get(item.sku) ?? null;
    if (!found) {
      unresolved += 1;
      return { sku: item.sku, quantity: item.quantity, quotedPrice: item.unitPrice ?? null, product: null };
    }
    total += found.price * item.quantity;
    if (item.unitPrice !== null && item.unitPrice !== undefined && item.unitPrice !== found.price) {
      priceChanged += 1;
    }
    if (found.stock < item.quantity) insufficientStock += 1;
    return {
      sku: item.sku,
      quantity: item.quantity,
      quotedPrice: item.unitPrice ?? null,
      product: {
        id: found.id,
        name: found.name,
        price: found.price,
        stock: found.stock,
        isArchived: found.isArchived,
      },
    };
  });

  return { lines, total, unresolved, priceChanged, insufficientStock };
}

// --- Vistas ----------------------------------------------------------------

export interface ConversationRow {
  id: string;
  /** `null` cuando Meta no manda el teléfono (contacto con nombre de usuario). */
  phone: string | null;
  /** Identidad de Meta que sí llega siempre; lo que sostiene la conversación. */
  bsuid: string | null;
  /** `@mrs_han14` sin arroba; a veces lo único con lo que reconocerla. */
  username: string | null;
  contactName: string | null;
  status: ConversationStatus;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  /**
   * Última vez que Paula escribió desde su celular. Es lo que calla al bot 24 h;
   * el panel lo necesita para poder decírselo a ella.
   */
  lastOwnerAt: Date | null;
  messageCount: number;
  /** Vista previa del último mensaje, ya legible (o el tipo de adjunto). */
  lastMessagePreview: string | null;
  lastMessageAt: Date | null;
  hasCart: boolean;
  orderId: string | null;
  /** En la lista de ignorados: el panel dejó de reflejar lo que llega. */
  ignored: boolean;
  /** Eventos que se dejaron pasar desde que se ignoró (0 si no lo está). */
  skippedCount: number;
}

export interface ConversationThreadMessage {
  id: string;
  direction: ConversationMessageDirection;
  sentBy: ConversationMessageSentBy;
  status: ConversationMessageStatus;
  body: string | null;
  mediaType: string | null;
  createdAt: Date;
  cart: ConversationCart | null;
  /** Id de lo tocado, o `null` si lo escribió a mano. */
  tappedOptionId: string | null;
}

export interface ConversationDetail {
  id: string;
  /** `null` cuando Meta no manda el teléfono (contacto con nombre de usuario). */
  phone: string | null;
  bsuid: string | null;
  username: string | null;
  contactName: string | null;
  status: ConversationStatus;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  /**
   * Última vez que Paula escribió desde su celular. Es lo que calla al bot 24 h;
   * el panel lo necesita para poder decírselo a ella.
   */
  lastOwnerAt: Date | null;
  orderId: string | null;
  createdAt: Date;
  messages: ConversationThreadMessage[];
  /** En la lista de ignorados: el panel dejó de reflejar lo que llega. */
  ignored: boolean;
  /** Eventos dejados pasar desde que se ignoró. */
  skippedCount: number;
}

/** Texto corto para la lista: el cuerpo, o el tipo de adjunto entre paréntesis. */
export function previewMessage(
  body: string | null,
  mediaType: string | null,
  maxLength = 80,
): string | null {
  const text = body?.replace(/\s+/g, " ").trim();
  if (text) return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
  const media = describeMedia(mediaType);
  return media ? `(${media})` : null;
}

// --- Entrada de la API -----------------------------------------------------

export const conversationStatusUpdateSchema = z.object({
  status: z.nativeEnum(ConversationStatus),
});

export type ConversationStatusUpdate = z.infer<typeof conversationStatusUpdateSchema>;

/**
 * Quita la parada de 24 h y deja la conversación abierta. `lastOwnerAt` a null
 * porque es lo que ese campo ya significa. No manda ningún mensaje.
 */
/**
 * Ignora al contacto de una conversación: el panel deja de reflejarlo.
 *
 * Guarda la identidad **completa** que tenga la conversación —teléfono y/o
 * BSUID, los dos si los hay— en una sola fila, para que el webhook la tape
 * venga por donde venga. No se inventa nada: si la conversación no tiene
 * ninguna de las dos, no hay con qué emparejar de forma exacta y se rechaza
 * antes que arriesgar una coincidencia de más.
 *
 * No manda nada a la clienta ni toca el WhatsApp de Paula.
 */
export async function ignoreConversationContact(
  storeId: string,
  conversationId: string,
  input: { reason: string; userId: string },
): Promise<
  | { ok: true; phone: string | null; bsuid: string | null }
  | { ok: false; reason: "not_found" | "no_identity" }
> {
  const conversation = await prismadb.conversation.findFirst({
    where: { id: conversationId, storeId },
    select: { phone: true, bsuid: true },
  });
  if (!conversation) return { ok: false, reason: "not_found" };

  const phone = normalizeIgnoredPhone(conversation.phone);
  const bsuid = normalizeIgnoredBsuid(conversation.bsuid);
  if (!phone && !bsuid) return { ok: false, reason: "no_identity" };

  // Puede existir ya por una de las dos identidades (se ignoró cuando solo se
  // conocía el teléfono y ahora además hay BSUID). Se completa la fila en vez
  // de crear una segunda que taparía al mismo contacto por duplicado.
  const existing = await prismadb.ignoredContact.findFirst({
    where: {
      storeId,
      OR: [...(phone ? [{ phone }] : []), ...(bsuid ? [{ bsuid }] : [])],
    },
    select: { id: true },
  });

  if (existing) {
    await prismadb.ignoredContact.update({
      where: { id: existing.id },
      data: { phone, bsuid, reason: input.reason, createdByUserId: input.userId },
    });
  } else {
    await prismadb.ignoredContact.create({
      data: { storeId, phone, bsuid, reason: input.reason, createdByUserId: input.userId },
    });
  }

  return { ok: true, phone, bsuid };
}

/**
 * Deja de ignorar al contacto.
 *
 * Devuelve cuántos eventos se dejaron pasar mientras tanto. **No los reprocesa
 * aquí a propósito**: pueden ser miles y cada uno costaría una publicación en
 * QStash, que es exactamente la cuota que esto vino a proteger. Recuperarlos
 * es una acción aparte y por lotes.
 */
export async function unignoreConversationContact(
  storeId: string,
  conversationId: string,
): Promise<{ ok: true; removed: number; pending: number } | { ok: false }> {
  const conversation = await prismadb.conversation.findFirst({
    where: { id: conversationId, storeId },
    select: { phone: true, bsuid: true },
  });
  if (!conversation) return { ok: false };

  const phone = normalizeIgnoredPhone(conversation.phone);
  const bsuid = normalizeIgnoredBsuid(conversation.bsuid);
  if (!phone && !bsuid) return { ok: true, removed: 0, pending: 0 };

  const conditions = [...(phone ? [{ phone }] : []), ...(bsuid ? [{ bsuid }] : [])];
  const pendientes = await prismadb.ignoredContact.aggregate({
    where: { storeId, OR: conditions },
    _sum: { skippedCount: true },
  });
  const { count } = await prismadb.ignoredContact.deleteMany({
    where: { storeId, OR: conditions },
  });

  return { ok: true, removed: count, pending: pendientes._sum.skippedCount ?? 0 };
}

export async function handBackToBot(
  storeId: string,
  conversationId: string,
): Promise<
  | { ok: true; changed: boolean }
  | { ok: false; reason: "not_found" | "conflict" }
> {
  const actual = await prismadb.conversation.findFirst({
    where: { id: conversationId, storeId },
    select: { id: true, status: true, lastOwnerAt: true },
  });
  if (!actual) return { ok: false, reason: "not_found" };

  // Ya estaba devuelta: tocar el botón dos veces no es un error, no hace nada.
  if (actual.status === ConversationStatus.OPEN && actual.lastOwnerAt === null) {
    return { ok: true, changed: false };
  }

  // Escritura condicionada a lo que se acaba de leer: si entre la lectura y
  // esto entró un mensaje de la clienta o Paula volvió a escribir, no se pisa
  // lo nuevo, se avisa y que lo mire otra vez.
  const escrito = await prismadb.conversation.updateMany({
    where: {
      id: actual.id,
      storeId,
      status: actual.status,
      lastOwnerAt: actual.lastOwnerAt,
    },
    data: { status: ConversationStatus.OPEN, lastOwnerAt: null },
  });
  if (escrito.count === 0) return { ok: false, reason: "conflict" };

  return { ok: true, changed: true };
}
