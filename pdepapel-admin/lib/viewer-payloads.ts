import { INTERNAL_PRODUCT_FIELDS } from "@/lib/public-catalog";

/**
 * Lo que una cuenta de solo lectura **no** puede ver.
 *
 * La regla es una sola y vive aquí: el dinero de la casa (costo de compra,
 * transporte, margen, utilidad, comisión de pasarela) y los datos personales
 * de las clientas (nombre, correo, teléfono, dirección, documento). Cada
 * lectura que se abre pasa su respuesta por estas funciones, así que abrir una
 * ruta nueva no obliga a recordar la lista.
 */

/** Campos internos del producto; reutiliza la lista que ya declaraba el catálogo. */
export const VIEWER_HIDDEN_PRODUCT_FIELDS = INTERNAL_PRODUCT_FIELDS;

/**
 * Contacto y dinero propio de un pedido.
 *
 * `city` y `department` **sí** se ven: dicen de dónde vienen las ventas, que
 * es justo lo que una agencia necesita, y solos no identifican a nadie. La
 * calle, el barrio, el código DANE, el teléfono, el correo, el nombre y el
 * documento siguen fuera.
 */
export const VIEWER_HIDDEN_ORDER_FIELDS = [
  "fullName",
  "email",
  "phone",
  "address",
  "address2",
  "addressReference",
  "neighborhood",
  "daneCode",
  "documentId",
  "company",
  "giftRecipientEmail",
  "giftRecipientPhone",
  "totalProductCost",
  "netProfit",
  "gatewayFee",
  "profitMarginPct",
  "productShippingCost",
  "productShippingMissing",
  "analyticsClientId",
  "analyticsSessionId",
  "adminNotes",
  "internalNotes",
  // Dinero de la casa, enlace público, señales de riesgo y datos del regalo.
  "shippingCost",
  "token",
  "riskScore",
  "riskReasons",
  "giftRecipientName",
  "giftMessage",
  // Quién es la clienta (cuenta o invitada).
  "userId",
  "guestId",
  // Prueba de consentimiento: solo la dueña la ve.
  "legalTermsVersion",
  "legalPrivacyVersion",
  "legalConsentAt",
  "legalConsentChannel",
  "whatsappOptInAt",
  "whatsappOptInVersion",
  "whatsappOptInSource",
  "whatsappOptInBy",
  "whatsappOptOutAt",
  "providerMessageId",
] as const;

/**
 * El envío dentro de un pedido. `cost` (lo que se le cobra a la clienta) y
 * `codFee` se quedan: con ellos se ven los totales. Fuera: guía, rastreo,
 * los datos de quien recibe (JSON de la transportadora) y lo que le cuesta
 * el envío a la casa.
 */
export const VIEWER_HIDDEN_ORDER_SHIPPING_FIELDS = [
  "trackingCode",
  "trackingUrl",
  "trackingNumber",
  "guideUrl",
  "labelUrl",
  "guidePdfBase64",
  "guideError",
  "destinationData",
  "originData",
  "quotationData",
  "notes",
  "flete",
  "codCost",
] as const;

/** Del pago solo se ven el método y el estado: ni la transacción ni el comprobante. */
export const VIEWER_HIDDEN_PAYMENT_FIELDS = ["transactionId", "details", "proofKey"] as const;

/** Nombres de personas en ventas de marketplace. */
export const VIEWER_HIDDEN_MARKETPLACE_FIELDS = ["buyerName", "trackingNumber"] as const;

/** Márgenes mínimos configurados por la dueña. */
export const VIEWER_HIDDEN_MARGIN_FIELDS = ["minimumMarginAmount"] as const;

type AnyRecord = Record<string, unknown>;

function omit<T extends AnyRecord>(row: T, fields: readonly string[]): T {
  const copy: AnyRecord = { ...row };
  for (const field of fields) delete copy[field];
  return copy as T;
}

/** Quita del producto el costo, el transporte, el proveedor y demás campos internos. */
/** Solo objetos literales: un `Decimal` o una `Date` de Prisma se dejan como están. */
function isPlainObject(value: unknown): value is AnyRecord {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const PRODUCT_SCRUB_MAX_DEPTH = 6;

function deepScrubProduct(value: unknown, depth: number): unknown {
  if (Array.isArray(value)) return value.map((item) => deepScrubProduct(item, depth));
  if (!isPlainObject(value) || depth > PRODUCT_SCRUB_MAX_DEPTH) return value;
  const clean: AnyRecord = {};
  for (const [key, child] of Object.entries(value)) {
    if ((VIEWER_HIDDEN_PRODUCT_FIELDS as readonly string[]).includes(key)) continue;
    if (key === "reviews" && Array.isArray(child)) {
      clean[key] = child.map((review) => (isPlainObject(review) ? scrubReview(review) : review));
      continue;
    }
    clean[key] = deepScrubProduct(child, depth + 1);
  }
  return clean;
}

/**
 * Un producto para la cuenta de solo lectura, con todo lo que cuelga de él:
 * piezas de kit (`kitComponents[].component`), variantes del grupo,
 * relaciones anidadas y reseñas. Antes solo se limpiaba el primer nivel y
 * cada pieza de un kit llegaba con su costo, transporte y proveedor.
 */
export function scrubProduct<T extends AnyRecord | null | undefined>(product: T): T {
  if (!product) return product;
  return deepScrubProduct(product, 0) as T;
}

export function scrubProducts<T extends AnyRecord>(products: T[]): T[] {
  return products.map((product) => scrubProduct(product));
}

/**
 * Quita de un pedido el contacto de la clienta y la utilidad, y limpia el
 * producto de cada línea (que trae su costo de compra).
 */
export function scrubOrder<T extends AnyRecord | null | undefined>(order: T): T {
  if (!order) return order;
  const clean = omit(order as AnyRecord, VIEWER_HIDDEN_ORDER_FIELDS);
  // Los cobros de la clienta (montos, medio, notas) tampoco: es plata recibida.
  if ("payments" in clean) clean.payments = [];
  // El comprobante de una transferencia trae datos bancarios de la clienta:
  // la cuenta de solo lectura no ve ni el enlace (la ruta que lo sirve
  // tampoco se lo daría).
  if (clean.payment && typeof clean.payment === "object") {
    clean.payment = { ...omit(clean.payment as AnyRecord, VIEWER_HIDDEN_PAYMENT_FIELDS), proofKey: null };
  }
  if (clean.shipping && typeof clean.shipping === "object") {
    const shipping = clean.shipping as AnyRecord;
    // Sin el número de guía, la etapa del pedido («va en camino») se calcula con esta marca.
    clean.shipping = { ...omit(shipping, VIEWER_HIDDEN_ORDER_SHIPPING_FIELDS), hasGuide: Boolean(shipping.trackingCode) };
  }
  const items = clean.orderItems;
  if (Array.isArray(items)) {
    clean.orderItems = items.map((item) => {
      if (!item || typeof item !== "object") return item;
      const line = { ...(item as AnyRecord) };
      if (line.product) line.product = scrubProduct(line.product as AnyRecord);
      return line;
    });
  }
  return clean as T;
}

export function scrubOrders<T extends AnyRecord>(orders: T[]): T[] {
  return orders.map((order) => scrubOrder(order));
}

/** Quita el nombre de quien compró y la guía de una fila de marketplace. */
export function scrubMarketplaceRow<T extends AnyRecord | null | undefined>(row: T): T {
  if (!row) return row;
  const clean = omit(row as AnyRecord, VIEWER_HIDDEN_MARKETPLACE_FIELDS);
  const order = clean.marketplaceOrder;
  if (order && typeof order === "object") {
    clean.marketplaceOrder = omit(order as AnyRecord, VIEWER_HIDDEN_MARKETPLACE_FIELDS);
  }
  return clean as T;
}

export function scrubMarketplaceRows<T extends AnyRecord>(rows: T[]): T[] {
  return rows.map((row) => scrubMarketplaceRow(row));
}

/** Quita el margen mínimo y, si viene, el producto con sus costos. */
export function scrubMargin<T extends AnyRecord | null | undefined>(row: T): T {
  if (!row) return row;
  const clean = omit(row as AnyRecord, VIEWER_HIDDEN_MARGIN_FIELDS);
  if (clean.product) clean.product = scrubProduct(clean.product as AnyRecord);
  return clean as T;
}

export function scrubMargins<T extends AnyRecord>(rows: T[]): T[] {
  return rows.map((row) => scrubMargin(row));
}

/**
 * Lo que cuesta una cápsula sorpresa y el margen mínimo con que se armó.
 *
 * La cápsula guarda `productCost` y `minimumMarginPct` como columnas suyas, no
 * dentro del producto, así que `scrubProduct` no las tocaba: el detalle de una
 * feria las entregaba enteras a una cuenta de solo lectura.
 */
export const VIEWER_HIDDEN_CAPSULE_FIELDS = ["productCost", "minimumMarginPct"] as const;

/** El detalle de una feria trae el costo de compra en cada producto reservado. */
export function scrubFairEvent<T extends AnyRecord | null | undefined>(detail: T): T {
  if (!detail) return detail;
  const clean = { ...(detail as AnyRecord) };
  const items = clean.inventoryItems;
  if (Array.isArray(items)) {
    // Cada fila lleva su producto y, si es un kit, sus piezas con costo.
    clean.inventoryItems = items.map((item) => (item && typeof item === "object" ? scrubProduct(item as AnyRecord) : item));
  }
  if (Array.isArray(clean.capsules)) {
    clean.capsules = (clean.capsules as AnyRecord[]).map((capsule) => {
      if (!capsule || typeof capsule !== "object") return capsule;
      const row = omit(capsule, VIEWER_HIDDEN_CAPSULE_FIELDS);
      if (row.product) row.product = scrubProduct(row.product as AnyRecord);
      return row;
    });
  }
  if (Array.isArray(clean.orders)) clean.orders = (clean.orders as AnyRecord[]).map((order) => scrubOrder(order));
  return clean as T;
}

/**
 * Lo que una edición de cápsulas por papeles sabe de la plata de la casa: la
 * banda de costo, el costo congelado de cada papel e impresión, el tope del
 * regalo y el costo provisional o real de un pedido de cápsulas.
 */
export const VIEWER_HIDDEN_CAPSULE_EDITION_FIELDS = [
  "costBandMin",
  "costBandMax",
  "unitCost",
  "totalCost",
  "giftMaxCost",
  "boxReserveCost",
  "provisionalCost",
  "realCost",
  "costStatus",
] as const;

function deepOmit(value: unknown, keys: ReadonlySet<string>, depth: number): unknown {
  if (Array.isArray(value)) return value.map((item) => deepOmit(item, keys, depth));
  if (!isPlainObject(value) || depth > PRODUCT_SCRUB_MAX_DEPTH) return value;
  const clean: AnyRecord = {};
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key)) continue;
    clean[key] = deepOmit(child, keys, depth + 1);
  }
  return clean;
}

const CAPSULE_EDITION_HIDDEN = new Set<string>([...VIEWER_HIDDEN_CAPSULE_EDITION_FIELDS, ...VIEWER_HIDDEN_PRODUCT_FIELDS, ...VIEWER_HIDDEN_ORDER_FIELDS]);

/** Una edición, impresión, papel o pedido de cápsulas (con lo que cuelgue de ellos) sin costos, bandas ni datos de clientas. */
export function scrubCapsulePayload<T>(payload: T): T {
  return deepOmit(payload, CAPSULE_EDITION_HIDDEN, 0) as T;
}

/** Un grupo trae sus variantes completas: cada una se limpia por dentro. */
export function scrubProductGroup<T extends AnyRecord | null | undefined>(group: T): T {
  if (!group) return group;
  const clean = { ...(group as AnyRecord) };
  if (Array.isArray(clean.products)) clean.products = scrubProducts(clean.products as AnyRecord[]);
  if (Array.isArray(clean.variants)) clean.variants = scrubProducts(clean.variants as AnyRecord[]);
  return clean as T;
}

export function scrubProductGroups<T extends AnyRecord>(groups: T[]): T[] {
  return groups.map((group) => scrubProductGroup(group));
}

/**
 * Una reseña vista por una cuenta de solo lectura: el nombre de quien escribe
 * ya se muestra en la tienda, así que se conserva; la moderación y el id de la
 * cuenta no.
 */
export const VIEWER_HIDDEN_REVIEW_FIELDS = ["userId", "moderationNote", "moderatedBy", "repliedBy"] as const;

export function scrubReview<T extends AnyRecord | null | undefined>(review: T): T {
  if (!review) return review;
  return omit(review as AnyRecord, VIEWER_HIDDEN_REVIEW_FIELDS) as T;
}

export function scrubReviews<T extends AnyRecord>(reviews: T[]): T[] {
  return reviews.map((review) => scrubReview(review));
}

/**
 * Inventario visto por una cuenta de solo lectura.
 *
 * Fuera: el precio de compra. Dentro: las unidades y las señales de
 * reposición —qué hay, qué se está acabando y qué no se mueve—, que es lo que
 * sirve para planear una campaña. El valor a precio de venta se conserva
 * porque sale de los precios públicos de la tienda: esconderlo no oculta nada.
 */
export const VIEWER_HIDDEN_INVENTORY_FIELDS = [
  "acqPrice",
  "transportationCost",
  "lastCost",
  "lastCostSource",
  "lastCostAt",
  // El proveedor ya es interno en el producto (`INTERNAL_PRODUCT_FIELDS`);
  // aquí se repite para que la fila de inventario no lo reintroduzca.
  "supplier",
] as const;

export function scrubInventoryRow<T extends AnyRecord | null | undefined>(row: T): T {
  if (!row) return row;
  return omit(row as AnyRecord, VIEWER_HIDDEN_INVENTORY_FIELDS) as T;
}

export function scrubInventoryRows<T extends AnyRecord>(rows: T[]): T[] {
  return rows.map((row) => scrubInventoryRow(row));
}

/**
 * Envíos vistos por una cuenta de solo lectura.
 *
 * Fuera: lo que cuesta despachar (dinero de la casa) y todo lo que identifica
 * a quien recibe, incluida la guía —con el número de guía se consulta el
 * nombre y la dirección en la página de la transportadora, así que se trata
 * como dato personal, igual que en las ventas de marketplace—. Dentro: estado,
 * fechas, ciudad y las señales de demora.
 */
export const VIEWER_HIDDEN_SHIPMENT_FIELDS = [
  "cost",
  "shippingCost",
  "trackingCode",
  "trackingNumber",
  "trackingUrl",
  "labelUrl",
  "guideUrl",
  "fullName",
  "phone",
  "email",
  "address",
  "address2",
  "addressReference",
  "neighborhood",
  "daneCode",
  "documentId",
] as const;

export function scrubShipment<T extends AnyRecord | null | undefined>(shipment: T): T {
  if (!shipment) return shipment;
  const clean = omit(shipment as AnyRecord, VIEWER_HIDDEN_SHIPMENT_FIELDS);
  if (clean.order) clean.order = scrubOrder(clean.order as AnyRecord);
  return clean as T;
}

export function scrubShipments<T extends AnyRecord>(shipments: T[]): T[] {
  return shipments.map((shipment) => scrubShipment(shipment));
}

/**
 * Preventas vistas por una cuenta de solo lectura.
 *
 * Fuera: el dinero ya recibido y los abonos por pedido —plata de las clientas
 * que la tienda todavía debe—. Dentro: qué producto está en preventa, cuántas
 * unidades hay reservadas y para cuándo se espera liberar, que es la señal de
 * demanda que sí sirve.
 */
export const VIEWER_HIDDEN_PRESALE_FIELDS = [
  "amountReceived",
  "collected",
  "depositsReceived",
  "depositAmount",
  "depositTotal",
  "totalReceived",
  "totalCollected",
  "refunded",
  "retained",
  "storeCredit",
  "balanceOwed",
  "onlinePendingAmount",
] as const;

export function scrubPresale<T extends AnyRecord | null | undefined>(presale: T): T {
  if (!presale) return presale;
  const clean = omit(presale as AnyRecord, VIEWER_HIDDEN_PRESALE_FIELDS);
  if (clean.product) clean.product = scrubProduct(clean.product as AnyRecord);
  if (Array.isArray(clean.orders)) clean.orders = (clean.orders as AnyRecord[]).map((order) => scrubOrder(order));
  return clean as T;
}

export function scrubPresales<T extends AnyRecord>(presales: T[]): T[] {
  return presales.map((presale) => scrubPresale(presale));
}

/**
 * Tarjetas de regalo vistas por una cuenta de solo lectura: saldo, estado y
 * movimientos sí; quién la compró, para quién y el mensaje, no.
 */
export const VIEWER_HIDDEN_GIFT_CARD_FIELDS = ["buyerEmail", "recipientEmail", "recipientName", "message"] as const;

export function scrubGiftCard<T extends AnyRecord | null | undefined>(card: T): T {
  if (!card) return card;
  const clean = omit(card as AnyRecord, VIEWER_HIDDEN_GIFT_CARD_FIELDS);
  if (clean.purchaseOrder && typeof clean.purchaseOrder === "object") {
    clean.purchaseOrder = omit(clean.purchaseOrder as AnyRecord, VIEWER_HIDDEN_ORDER_FIELDS);
  }
  return clean as T;
}

export function scrubGiftCards<T extends AnyRecord>(cards: T[]): T[] {
  return cards.map((card) => scrubGiftCard(card));
}

/**
 * Lista de espera de una preventa vista por una cuenta de solo lectura:
 * cuántas hay, por qué canal y en qué estado; nunca a quién contactar ni la
 * prueba de su consentimiento.
 */
export const VIEWER_HIDDEN_WAITLIST_FIELDS = [
  "name",
  "phone",
  "email",
  "handle",
  "note",
  "consentText",
  "consentVersion",
  "createdBy",
] as const;

export function scrubWaitlistEntry<T extends AnyRecord | null | undefined>(entry: T): T {
  if (!entry) return entry;
  return omit(entry as AnyRecord, VIEWER_HIDDEN_WAITLIST_FIELDS) as T;
}

export function scrubWaitlistEntries<T extends AnyRecord>(entries: T[]): T[] {
  return entries.map((entry) => scrubWaitlistEntry(entry));
}
