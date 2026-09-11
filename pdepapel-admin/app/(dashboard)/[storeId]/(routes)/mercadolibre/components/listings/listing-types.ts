/**
 * Tipos de la tabla de publicaciones de Mercado Libre (lo que devuelve
 * `GET /marketplaces/mercadolibre/listings`) y del resultado de las acciones.
 */

export type MarketplaceAttribute = {
  id: string;
  value_id?: string | null;
  value_name?: string | null;
};

export type ProductReference = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  price: number;
  acqPrice: number | null;
  /** Envío y otros gastos por unidad; entra al piso y a la ganancia. */
  transportationCost: number | null;
  images: { url: string; isMain?: boolean }[];
  category?: { id: string; name: string } | null;
  /** Datos que rellenan la ficha técnica sin volver a teclearlos. */
  brand?: string | null;
  gtin?: string | null;
  mpn?: string | null;
  hasNoProductIdentifier?: boolean;
  colorName?: string | null;
  sizeName?: string | null;
  /** Forma anidada que devuelve `GET /listings` (el producto de una publicación guardada). */
  color?: { name: string } | null;
  size?: { name: string } | null;
};

export type ListingStatus =
  | "DRAFT"
  | "ACTIVE"
  | "PAUSED"
  | "CLOSED"
  | "ERROR"
  | "UNLINKED";

export type Listing = {
  id: string;
  categoryId: string | null;
  listingType: string | null;
  marketplacePrice: number | null;
  stockSafetyBuffer: number;
  syncStock: boolean;
  syncPrice: boolean;
  minimumMarginAmount: number | null;
  status: ListingStatus;
  externalPermalink: string | null;
  externalItemId: string | null;
  lastSyncedStock: number | null;
  lastError: string | null;
  metadata: {
    attributes?: MarketplaceAttribute[];
    media?: { imageUrls?: string[] };
    familyName?: string;
    source?: string;
    currencyId?: string | null;
    catalogListing?: boolean;
    saleConditions?: {
      shippingMode: string;
      freeShipping: boolean;
      localPickUp: boolean;
      packageDimensions: {
        heightCm: number;
        widthCm: number;
        lengthCm: number;
        weightGrams: number;
      } | null;
    };
    belowCostOverride?: { reason: string; floor: number; price: number; at: string } | null;
    publicationError?: {
      kind: "review" | "transient" | "reauth" | "unknown";
      step: "producto" | "categoria" | "ficha" | "precio" | null;
      field: string | null;
      message: string;
      at: string;
    } | null;
  } | null;
  product: ProductReference;
};

export type ListingQualityRule = {
  key: string | null;
  link: string | null;
  title: string;
  label: string | null;
  mode: "OPPORTUNITY" | "WARNING" | null;
  isVideoRecommendation: boolean;
};

export type ListingQuality = {
  score: number | null;
  level: string | null;
  levelWording: string | null;
  pendingRules: ListingQualityRule[];
  videoRecommendation:
    | (ListingQualityRule & {
        preparedVideoCount: number;
        snoozedUntil: string | null;
      })
    | null;
};

export type ContentReview = {
  familyName: string;
  familyNameLength: number;
  descriptionPreview: string;
  checks: { label: string; ready: boolean; detail: string }[];
};

export const bulkActionLabels = {
  publish: "Publicar borradores",
  sync_stock: "Sincronizar stock",
  sync_price: "Sincronizar precios",
  sync_content: "Sincronizar contenido",
  pause: "Pausar publicaciones",
  activate: "Activar publicaciones",
} as const;

export type BulkAction = keyof typeof bulkActionLabels;

/** Tope del servidor para una acción masiva; se aplica también en pantalla. */
export const MAX_BULK_LISTINGS = 20;

export type BulkOutcome = {
  action: BulkAction;
  at: string;
  queued: number;
  skipped: number;
  byListingId: Record<string, { outcome: "queued" | "skipped"; reason: string | null }>;
};

/** Ids con una acción en curso, para deshabilitar los botones de esa fila. */
export type ListingBusyState = {
  publishingId: string | null;
  deletingDraftId: string | null;
  reviewingContentId: string | null;
  syncingContentId: string | null;
  loadingQualityId: string | null;
  changingStatusId: string | null;
  updatingVideoReminderId: string | null;
};

export const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
