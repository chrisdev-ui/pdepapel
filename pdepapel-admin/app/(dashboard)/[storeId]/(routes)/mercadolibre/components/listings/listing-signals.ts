import type { Listing } from "./listing-types";

/** Tono de la insignia de estado: mismo vocabulario que Pedidos y Ventas. */
export const LISTING_STATUS_TONE: Record<string, string> = {
  DRAFT: "slate",
  ACTIVE: "mint",
  PAUSED: "cream",
  CLOSED: "slate",
  ERROR: "pink",
  UNLINKED: "cream",
};

export type ListingSignal = {
  key: string;
  label: string;
  tone: "mint" | "cream" | "pink" | "sky" | "lavender" | "slate";
  /** Texto largo para el título del chip y la tarjeta móvil. */
  detail?: string;
};

const PUBLICATION_STEP_LABELS: Record<string, string> = {
  producto: "producto",
  categoria: "categoría y fotos",
  ficha: "ficha técnica",
  precio: "precio",
};

/** Unidades que Mercado Libre debería mostrar: stock local menos la reserva. */
export function getPublishedUnits(listing: Pick<Listing, "stockSafetyBuffer" | "product">) {
  return Math.max(0, listing.product.stock - listing.stockSafetyBuffer);
}

/**
 * Lo que la fila tiene que decir sin abrir nada: rechazo pendiente, venta
 * bajo costo autorizada, qué se sincroniza, fotos y envío. Antes nada de esto
 * era visible hasta abrir el asistente.
 */
export function getListingSignals(listing: Listing): ListingSignal[] {
  const signals: ListingSignal[] = [];
  const failure = listing.metadata?.publicationError ?? null;
  if (failure) {
    if (failure.kind === "review") {
      signals.push({
        key: "publication-error",
        label: `Rechazada: ${failure.step ? PUBLICATION_STEP_LABELS[failure.step] ?? failure.step : "revisar"}${failure.field ? ` · ${failure.field}` : ""}`,
        tone: "pink",
        detail: failure.message,
      });
    } else if (failure.kind === "transient") {
      signals.push({
        key: "publication-retry",
        label: "Reintento pendiente",
        tone: "cream",
        detail: failure.message,
      });
    } else if (failure.kind === "reauth") {
      signals.push({
        key: "publication-reauth",
        label: "Reconectar cuenta",
        tone: "pink",
        detail: failure.message,
      });
    } else {
      signals.push({
        key: "publication-unknown",
        label: "Fallo al publicar",
        tone: "pink",
        detail: failure.message,
      });
    }
  }
  const override = listing.metadata?.belowCostOverride ?? null;
  if (override) {
    signals.push({
      key: "below-cost",
      label: "Bajo costo autorizado",
      tone: "cream",
      detail: `Motivo: ${override.reason}`,
    });
  }
  if (listing.externalItemId) {
    signals.push(
      listing.syncStock
        ? { key: "sync-stock", label: "Stock desde el panel", tone: "sky" }
        : {
            key: "sync-stock-off",
            label: "Stock no se sincroniza",
            tone: "cream",
            detail: "Mercado Libre no recibe el stock local de esta publicación.",
          },
    );
    signals.push(
      listing.syncPrice
        ? { key: "sync-price", label: "Precio desde el panel", tone: "sky" }
        : { key: "sync-price-off", label: "Precio manual en Mercado Libre", tone: "slate" },
    );
  }
  const imageCount = listing.metadata?.media?.imageUrls?.length ?? listing.product.images.length;
  signals.push({
    key: "images",
    label: `${imageCount} foto${imageCount === 1 ? "" : "s"}`,
    tone: imageCount === 0 ? "pink" : "slate",
  });
  if (listing.metadata?.saleConditions?.freeShipping) {
    signals.push({ key: "free-shipping", label: "Envío gratis", tone: "mint" });
  }
  if (listing.metadata?.source === "MERCADOLIBRE_IMPORT") {
    signals.push({ key: "imported", label: "Importada", tone: "lavender" });
  }
  if (listing.metadata?.currencyId && listing.metadata.currencyId !== "COP") {
    signals.push({
      key: "currency",
      label: `Precio en ${listing.metadata.currencyId}`,
      tone: "cream",
      detail: "El panel muestra el valor como pesos; revísalo en Mercado Libre.",
    });
  }
  if (listing.metadata?.catalogListing) {
    signals.push({
      key: "catalog",
      label: "Catálogo de Mercado Libre",
      tone: "cream",
      detail: "Mercado Libre controla el precio; el precio local no se envía.",
    });
  }
  return signals;
}

export function canDeleteListingDraft(listing: Listing) {
  return !listing.externalItemId && (listing.status === "DRAFT" || listing.status === "ERROR");
}
