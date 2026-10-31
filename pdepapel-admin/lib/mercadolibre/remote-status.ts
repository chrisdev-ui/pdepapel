import { getMarketplaceListingStatusFromRemote } from "@/lib/mercadolibre/listings";

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/**
 * Lo que Mercado Libre dice hoy de un ítem (`GET /items/{id}`), para verificar
 * una publicación sin depender de la página pública: estado y subestado,
 * cantidad, fotos y condiciones. `localStatus` es cómo lo guardaría el panel.
 */
export function parseMercadoLibreRemoteItemStatus(payload: unknown) {
  const item = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const status = text(item.status);
  const shipping = (item.shipping && typeof item.shipping === "object" ? item.shipping : {}) as Record<string, unknown>;
  const mapped = getMarketplaceListingStatusFromRemote(status);
  return {
    itemId: text(item.id),
    status,
    subStatus: Array.isArray(item.sub_status) ? item.sub_status.filter((value): value is string => typeof value === "string") : [],
    localStatus: mapped.status,
    note: mapped.note,
    title: text(item.title),
    price: count(item.price),
    categoryId: text(item.category_id),
    listingType: text(item.listing_type_id),
    availableQuantity: count(item.available_quantity),
    soldQuantity: count(item.sold_quantity),
    pictureCount: Array.isArray(item.pictures) ? item.pictures.length : null,
    freeShipping: typeof shipping.free_shipping === "boolean" ? shipping.free_shipping : null,
    permalink: text(item.permalink),
    lastUpdated: text(item.last_updated),
  };
}
