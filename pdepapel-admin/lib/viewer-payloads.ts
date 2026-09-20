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
    clean.inventoryItems = items.map((item) => {
      if (!item || typeof item !== "object") return item;
      const row = { ...(item as AnyRecord) };
      if (row.product) row.product = scrubProduct(row.product as AnyRecord);
      return row;
    });
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
  "depositAmount",
  "depositTotal",
  "totalReceived",
  "totalCollected",
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
