import { PaymentMethod, Social } from "@/constants";

export interface Billboard {
  id: string;
  label: string;
  imageUrl: string;
  title: string | null;
  redirectUrl: string | null;
}

export interface Type {
  id: string;
  categories: Category[];
  name: string;
}

export interface Product {
  id: string;
  category: Category;
  name: string;
  description: string;
  price: string;
  stock: number;
  isFeatured: boolean;
  size: Size;
  color: Color;
  design: Design;
  images: Image[];
  reviews: Review[];
  sku: string;
  quantity?: number;
}

export interface Category {
  id: string;
  typeId: string;
  name: string;
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

export interface MainBanner {
  id: string;
  title: string;
  label1: string;
  label2: string;
  highlight: string;
  imageUrl: string;
  callToAction: string;
}

export interface Banner {
  imageUrl: string;
  callToAction: string;
}

export interface PriceRange {
  id: string;
  name: string;
}

export interface Review {
  id: string;
  userId: string;
  name: string;
  rating: number;
  comment: string;
}

export interface Coupon {
  id: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
  type: "PERCENTAGE" | "FIXED";
  storeId: string;
  amount: number;
  startDate: Date;
  endDate: Date;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
  minOrderValue: number | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string | null;
  guestId: string | null;
  status: string;
  fullName: string;
  phone: string;
  email?: string;
  address: string;
  city?: string;
  department?: string;
  daneCode?: string;
  neighborhood?: string | null;
  address2?: string | null;
  addressReference?: string | null;
  company?: string | null;
  orderItems: OrderItem[];
  payment: Payment;
  shipping: Shipping;
  subtotal: number;
  total: number;
  discount?: number;
  discountType?: "PERCENTAGE" | "FIXED";
  documentId?: string | null;
  coupon?: Coupon | null;
  couponDiscount?: number;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  product: Product;
  quantity: number;
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

export interface ShippingQuote {
  idRate: number;
  carrier: string;
  product: string;
  flete: number;
  minimumInsurance: number;
  totalCost: number;
  deliveryDays: string | number;
  isCOD: boolean;
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
}

export type PayUFormState = Omit<PayUFormProps, "formRef" | "products">;

export interface PayUFormProps {
  formRef: React.RefObject<HTMLFormElement>;
  referenceCode: string;
  products: formattedProduct[];
  amount: number;
  tax?: number;
  taxReturnBase?: number;
  currency?: string;
  signature: string;
  test: number;
  responseUrl: string;
  confirmationUrl: string;
  shippingAddress: string;
  shippingCity: string;
  shippingCountry: string;
}

export interface WompiResponse {
  url: string;
}

export type CheckoutByOrderResponse = PayUFormState | WompiResponse;

export interface CheckoutOrder {
  fullName: string;
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
  subtotal: number;
  total: number;
  orderItems: {
    productId: string;
    quantity: number | undefined;
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
  shippingProvider?: "ENVIOCLICK" | "NONE";
  envioClickIdRate?: number;
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
  items: {
    productId: string;
    quantity: number;
  }[];
  forceRefresh?: boolean;
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
