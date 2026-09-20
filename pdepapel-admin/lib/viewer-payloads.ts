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
  "totalProductCost",
  "netProfit",
  "gatewayFee",
  "profitMarginPct",
  "analyticsClientId",
  "adminNotes",
  "internalNotes",
] as const;

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
export function scrubProduct<T extends AnyRecord | null | undefined>(product: T): T {
  if (!product) return product;
  return omit(product as AnyRecord, VIEWER_HIDDEN_PRODUCT_FIELDS) as T;
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

/** El detalle de una feria trae el costo de compra en cada producto reservado. */
export function scrubFairEvent<T extends AnyRecord | null | undefined>(detail: T): T {
  if (!detail) return detail;
  const clean = { ...(detail as AnyRecord) };
  const items = clean.inventoryItems;
  if (Array.isArray(items)) {
    clean.inventoryItems = items.map((item) => {
      if (!item || typeof item !== "object") return item;
      const row = { ...(item as AnyRecord) };
      if (row.product) row.product = scrubProduct(row.product as AnyRecord);
      return row;
    });
  }
  if (Array.isArray(clean.orders)) clean.orders = (clean.orders as AnyRecord[]).map((order) => scrubOrder(order));
  return clean as T;
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
