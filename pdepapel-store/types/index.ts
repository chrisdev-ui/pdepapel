import type { ColorSwatchType } from "@/lib/color-swatch";
import { PaymentMethod, Social } from "@/constants";

export enum Season {
  Default = "DEFAULT",
  Christmas = "CHRISTMAS",
  Spooky = "SPOOKY",
}

export interface SeasonConfig {
  navbarText: string;
  navbarNoText: string;
  logoAccent?: string;
}

export interface Type {
  id: string;
  categories: Category[];
  name: string;
  slug?: string;
  /** Nombre de icono de Lucide (kebab-case) elegido en el panel. */
  icon?: string | null;
  /** Icono propio generado con IA: trazos SVG ya saneados por el panel. */
  iconSvg?: string | null;
}

export interface KitComponent {
  component: {
    id: string;
    name: string;
    images: Image[];
    sku: string;
    slug?: string;
  };
  quantity: number;
}

export type BrandLogoPermission = "UNKNOWN" | "ALLOWED" | "PENDING" | "DENIED";

/** La marca tal como sale en el producto. `isPublic` en false = solo para datos (JSON-LD, GA4), nunca en la interfaz. */
export interface PublicBrand {
  name: string;
  slug: string;
  logoUrl: string | null;
  logoHasBackground: boolean;
  logoPermission: BrandLogoPermission;
  color: string | null;
  isPublic: boolean;
  /** La marca madre cuando esta es una línea (Flower Power → Primavera); null si no tiene o está archivada. */
  parent: { name: string; slug: string; isPublic: boolean } | null;
}

/** Marca visible de `GET /brands` (lista) o `GET /brands/{slug}` (página). */
export interface BrandSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  logoHasBackground: boolean;
  logoPermission: BrandLogoPermission;
  color: string | null;
  seoText: string | null;
  isFeatured: boolean;
  sortOrder: number;
  productCount: number;
  /** Solo cuando la madre es visible. */
  parent: { name: string; slug: string } | null;
}

export interface BrandLine {
  name: string;
  slug: string;
  logoUrl: string | null;
  logoPermission: BrandLogoPermission;
  productCount: number;
}

export interface BrandPageData extends BrandSummary {
  categories: { id: string; name: string; slug: string; count: number }[];
  /** Líneas visibles con productos, en el orden del panel. */
  lines: BrandLine[];
}

export interface BrandFacet {
  /** Slug de la marca: el valor de `?marca=`. */
  id: string;
  count: number;
  name: string;
  logoUrl: string | null;
  logoHasBackground: boolean;
  logoPermission: BrandLogoPermission;
}

export interface Product {
  id: string;
  slug?: string;
  category: Category;
  name: string;
  description: string;
  price: string;
  stock: number;
  isFeatured: boolean;
  isArchived?: boolean;
  size: Size;
  color: Color;
  design: Design;
  images: Image[];
  reviews: Review[];
  sku: string;
  brand?: PublicBrand | null;
  gtin?: string | null;
  mpn?: string | null;
  hasNoProductIdentifier?: boolean;
  /** Fecha desde la que se puede comprar; en el futuro = «Próximamente». */
  availableAt?: string | null;
  /** Preventa activa: se puede reservar hoy y llega en la fecha prometida. */
  presales?: {
    id: string;
    expectedArrivalAt: string;
    unitLimit: number;
    committedUnits: number;
    /** Apartadas por pedidos recientes sin pagar; solo viene en consultas sin caché. */
    heldUnits?: number;
  }[];
  /** Escalera de precio por cantidad; vacía o ausente = precio plano. */
  priceTiers?: { minQuantity: number; unitPrice: number }[];
  createdAt?: string;
  quantity?: number;
  updatedAt?: string;
  // Discount fields
  discountedPrice?: number;
  originalPrice?: number;
  offerLabel?: string | null;
  // Variant fields
  isGroup?: boolean;
  variantCount?: number;
  productGroupId?: string | null;
  productGroup?: {
    id: string;
    name: string;
    brand?: PublicBrand | null;
  } | null;
  hasDiscount?: boolean;
  minPrice?: number;
  maxPrice?: number;
  // Kit fields
  isKit?: boolean;
  kitComponents?: KitComponent[];
  catalogOptionValues?: Array<{
    option: { id: string; key: string; name: string; displayOrder: number };
    optionValue: { id: string; name: string; value: string };
  }>;
}

export interface ProductVariant {
  id: string;
  slug?: string;
  size: Size;
  color: Color;
  design: Design;
  stock: number;
  /** Foto principal de la variante (URL de Cloudinary): miniatura del selector de diseño. */
  image?: string | null;
}

export interface Category {
  id: string;
  typeId: string;
  name: string;
  slug?: string;
  /** Productos a la venta en la subcategoría (lista pública de categorías). */
  productCount?: number;
  seoEnabled?: boolean;
  seoFeatured?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoIntro?: string | null;
  imageUrl?: string | null;
  icon?: string | null;
}

export interface CatalogOptionValue {
  id: string;
  name: string;
  value: string;
  count: number;
  categoryCounts?: Record<string, number>;
}

export interface CatalogOption {
  id: string;
  key: string;
  name: string;
  displayOrder: number;
  categoryIds: string[];
  values: CatalogOptionValue[];
}

export interface Size {
  id: string;
  name: string;
  value: string;
}

export interface Color {
  id: string;
  name: string;
  value: string;
  /** Cómo se pinta la muestra (panel → «Tipo de muestra»). Sin él, sólido con el hex. */
  swatchType?: ColorSwatchType | null;
}

export interface Design {
  id: string;
  name: string;
}

export interface Image {
  id: string;
  url: string;
  isMain: boolean;
}

export type HomeContentPlacement = "HERO" | "CAMPAIGN";
export type HomeCampaignType = "SEASON" | "SHIPMENT" | "COLLECTION" | "OFFER";

export interface HomeContentProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  stock: number;
  imageUrl: string | null;
}

export interface HomeContent {
  id: string;
  placement: HomeContentPlacement;
  campaignType: HomeCampaignType | null;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  primaryLabel: string | null;
  primaryUrl: string | null;
  secondaryLabel: string | null;
  secondaryUrl: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  startsAt: string;
  endsAt: string | null;
  products: HomeContentProduct[];
}

export interface LiveHomeContent {
  hero: HomeContent | null;
  campaign: HomeContent | null;
}

export interface HomeReview {
  id: string;
  productId: string;
  name: string;
  rating: number;
  comment: string | null;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    slug: string;
    isArchived: boolean;
    imageUrl: string | null;
  };
}

export interface HomeReviewsResponse {
  reviews: HomeReview[];
  summary: { average: number | null; count: number };
}

export interface Review {
  id: string;
  name: string;
  rating: number;
  comment: string;
  /** Respuesta pública de la tienda; llega solo para reseñas publicadas. */
  reply?: string | null;
  repliedAt?: string | null;
  createdAt?: string;
}

/** Lo que `POST /coupons/validate` devuelve a la tienda: nunca la fila completa. */
export interface Coupon {
  id: string;
  code: string;
  type: "PERCENTAGE" | "FIXED";
  amount: number;
  minOrderValue: number | null;
  isActive: boolean;
  isWelcomeBenefit?: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string | null;
  guestId: string | null;
  status: string;
  /** STANDARD, GIFT_CARD, … Sólo GIFT_CARD cambia la página del pedido. */
  type?: string;
  /** Con `masked` llega recortado («Ana M.»). */
  fullName: string;
  /** Con `masked` llegan solo los últimos cuatro dígitos («•••• 1234»). */
  phone: string;
  email?: string;
  /** Sin `address*`, barrio ni empresa cuando `masked`: solo ciudad y departamento. */
  address?: string | null;
  city?: string;
  department?: string;
  daneCode?: string;
  neighborhood?: string | null;
  address2?: string | null;
  addressReference?: string | null;
  company?: string | null;
  orderItems: OrderItem[];
  payment: Payment;
  /** Una compra de tarjeta de regalo no tiene envío. */
  shipping?: Shipping | null;
  subtotal: number;
  total: number;
  discount?: number;
  discountType?: "PERCENTAGE" | "FIXED";
  documentId?: string | null;
  coupon?: Coupon | null;
  couponDiscount?: number;
  /** El panel creó el pedido; el id de quien lo hizo nunca llega a la tienda. */
  createdByAdmin?: boolean;
  /** Regalo: solo la bandera, el nombre y el mensaje llegan a la tienda. */
  isGift?: boolean;
  giftRecipientName?: string | null;
  giftMessage?: string | null;
  /** Lo que una tarjeta de regalo cubrió de este pedido (0 si ninguna). */
  giftCardAmount?: number;
  /** La tarjeta que este pedido compró (solo pedidos de tipo GIFT_CARD). */
  giftCardPurchase?: {
    recipientName: string | null;
    initialAmount: number;
    codeLast4: string;
    deliveredAt: string | null;
  } | null;
  createdAt: string;
  /** Set by the admin only when a genuine payment was confirmed. */
  paidAt?: string | null;
  /** Lo calcula la administración desde el estado; la tienda no lo deduce de la pasarela. */
  paymentResult?: PaymentResult;
  /** Quien abre el enlace sin ser la clienta del pedido recibe los datos recortados. */
  masked?: boolean;
  /** Pack de cápsulas sorpresa: lo que salió llega solo con el sorteo cerrado. */
  capsule?: {
    editionName: string;
    editionNumber: number;
    packSize: number;
    giftLabel: string | null;
    drawCompleted: boolean;
    products: { name: string; gift: boolean }[];
  } | null;
}

export type PaymentResult = "approved" | "declined" | "pending";

export interface OrderItem {
  id: string;
  product?: Product | null;
  productId?: string | null;
  quantity: number;
  name?: string;
  sku?: string;
  price?: number | string;
  imageUrl?: string;
  isCustom?: boolean;
}

export interface Payment {
  id: string;
  method: string;
  transactionId?: string;
}

export interface Shipping {
  id: string;
  provider: "ENVIOCLICK" | "MANUAL" | "NONE";
  status: string;
  courier?: string;
  carrierName?: string;
  productName?: string;
  flete?: number;
  minimumInsurance?: number;
  deliveryDays?: number;
  isCOD?: boolean;
  cost: number;
  /** Recaudo contra entrega, aparte del envío. */
  codFee?: number | null;
  trackingCode?: string;
  trackingUrl?: string;
  guideUrl?: string;
  envioClickIdRate?: number | null;
  envioClickIdOrder?: number | null;
  estimatedDeliveryDate?: string | null;
  actualDeliveryDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShippingTrackingEvent {
  id: string;
  shippingId: string;
  status: string;
  description: string;
  location: string | null;
  timestamp: string;
  createdAt: string;
}

export interface ShippingQuote {
  idRate: number;
  carrier: string;
  product: string;
  flete: number;
  minimumInsurance: number;
  totalCost: number;
  deliveryDays: string | number;
  isCOD: boolean;
  /** Contra entrega: el recaudo final que se cobra con esta tarifa (lo calcula el panel). */
  codFee?: number | null;
}

export interface Post {
  id: string;
  social: Social;
  postId: string;
  createdAt: string;
}

export interface ProductsResponse {
  products: Product[];
  totalPages: number;
  totalItems: number;
  isUnavailable?: boolean;
  /** Búsqueda corregida por la API cuando el texto original no coincidía con nada. */
  searchCorrection?: { original: string; corrected: string } | null;
  facets?: {
    colors: { id: string; count: number }[];
    formattedSizes: { id: string; count: number }[];
    categories: { id: string; count: number }[];
    designs: { id: string; count: number }[];
    types?: { id: string; count: number }[];
    optionValues?: { id: string; count: number }[];
    priceRanges?: { id: string; count: number }[];
    brands?: BrandFacet[];
  };
}

export interface StorefrontSettings {
  /** Product subtotal (COP) from which shipping is free; null = disabled. */
  freeShippingThreshold: number | null;
  /** Horario ya legible («08:00 - 20:00, Lun - Dom»); null si no está configurado. */
  openingHoursLabel: string | null;
  cityName: string | null;
  hasPhysicalStore: boolean;
  physicalAddress: string | null;
  /** Cuánto tarda en llegar un pedido («2 a 4 días hábiles»); null si no está configurado. */
  deliveryEstimate: string | null;
}

export interface SearchResult {
  id: string;
  slug?: string;
  name: string;
  price: string | number;
  minPrice?: number;
  isGroup?: boolean;
  image: Image;
}

export type SearchResponse = SearchResult[] | { products: SearchResult[] };

export interface WompiResponse {
  url: string;
}

/** Pre-signed payload for the default online gateway, opened from the order page. */
export interface BoldCheckoutResponse {
  order: Order;
  boldData: import("@/lib/bold").BoldCheckoutPayload;
}

/** `POST /checkout` answers with a gateway handshake or, for offline methods, the order itself. */
export type CheckoutResponse = WompiResponse | BoldCheckoutResponse | Order;

/** `POST /gift-cards/checkout`: la compra de una tarjeta de regalo. */
export interface GiftCardPurchase {
  /** Versiones de términos y privacidad que la frase encima del botón de pago mostró. */
  legalConsent?: { terms: string; privacy: string };
  amount: number;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  recipientName?: string;
  recipientEmail?: string;
  message?: string;
  payment: { method: PaymentMethod };
  userId: string | null;
  guestId: string | null;
  /** Campo trampa y reloj del formulario (components/bot-trap.tsx). */
  website?: string;
  formStartedAt?: number;
  turnstileToken?: string;
}

/** `POST /checkout/[orderId]` only ever returns the fallback gateway link. */
export type CheckoutByOrderResponse = WompiResponse;

export interface CheckoutOrder {
  /** Versiones de términos y privacidad que la frase encima del botón de pago mostró. */
  legalConsent?: { terms: string; privacy: string };
  fullName: string;
  /** Campo trampa y reloj del formulario (components/bot-trap.tsx). */
  website?: string;
  formStartedAt?: number;
  turnstileToken?: string;
  phone: string;
  email: string | null | undefined;
  address: string;
  city?: string;
  department?: string;
  daneCode?: string;
  neighborhood?: string;
  address2?: string;
  addressReference?: string;
  company?: string;
  userId: string | null | undefined;
  guestId: string | null;
  documentId: string | null | undefined;
  couponCode: string | null;
  /** Código validado de una tarjeta de regalo; null si no se aplicó. */
  giftCardCode?: string | null;
  subtotal: number;
  total: number;
  orderItems: {
    productId: string;
    quantity: number;
  }[];
  payment: {
    method: PaymentMethod;
  };
  shipping?: {
    carrierName?: string;
    courier?: string;
    productName?: string;
    flete?: number;
    minimumInsurance?: number;
    deliveryDays?: number;
    isCOD?: boolean;
    cost?: number;
    status?: string;
  };
  shippingProvider?: string;
  shippingOptionType?: string;
  envioClickIdRate?: number;
  analyticsClientId?: string | null;
  analyticsSessionId?: string | null;
  saveAddress?: boolean;
  savedAddressId?: string | null;
  addressLabel?: string | null;
  /** Regalo: quien recibe. `email`/`fullName` siguen siendo de quien compra. */
  isGift?: boolean;
  giftRecipientName?: string | null;
  giftRecipientEmail?: string | null;
  giftRecipientPhone?: string | null;
  giftMessage?: string | null;
}

export interface DaneLocation {
  _id: string;
  locationName: string;
  departmentOrStateName: string;
  locationCode: string; // Código DANE (8 dígitos)
  departmentOrStateCode: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  departmentCode: string;
  tccCode?: string;
  deprisaCode?: string;
  deprisaName?: string;
}

export interface LocationOption {
  value: string; // daneCode: "05001000"
  label: string; // "Medellín - Antioquia"
  city: string; // "Medellín"
  department: string; // "Antioquia"
  daneCode: string; // "05001000"
  raw: DaneLocation;
}

export interface ShippingQuoteRequest {
  destination: {
    daneCode: string;
    address: string;
  };
  orderTotal: number;
  /** Contra entrega: el pedido sin envío (después del cupón) y el subtotal de productos. */
  amountBeforeShipping?: number;
  productSubtotal?: number;
  items: {
    productId: string;
    quantity: number;
  }[];
  forceRefresh?: boolean;
  isCOD?: boolean;
}

export interface ShippingQuoteResponse {
  success: boolean;
  quotes: ShippingQuote[];
  daneCode: string;
  packageDimensions: {
    weight: number;
    height: number;
    width: number;
    length: number;
    type?: string;
    size?: string;
  };
  cached?: boolean;
}

export interface ShippingCarrier {
  idCarrier: number;
  carrier: string;
  code: string;
  comercialName: string;
  logoUrl: string;
  color: string;
}
