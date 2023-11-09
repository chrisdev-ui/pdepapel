export interface Billboard {
  id: string;
  label: string;
  imageUrl: string;
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
  quantity?: number;
}

export interface Category {
  id: string;
  type: Type;
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

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: string;
  fullName: string;
  phone: string;
  address: string;
  orderItems: OrderItem[];
  payment: Payment;
  shipping: Shipping;
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
  trackingNumber: string;
}
