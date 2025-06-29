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
  address: string;
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
  status: string;
  courier: string;
  cost: number;
  trackingCode: string;
  createdAt: string;
  updatedAt: string;
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
  address: string;
  email: string | null | undefined;
  userId: string | null | undefined;
  guestId: string | null;
  couponCode: string | null;
  subtotal: number;
  total: number;
  documentId: string | null | undefined;
  orderItems: {
    productId: string;
    quantity: number | undefined;
  }[];
  payment: {
    method: PaymentMethod;
  };
}
