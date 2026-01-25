export interface UnifiedOrderItem {
  id: string;
  productId?: string;
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  imageUrl?: string;
  isExternal?: boolean;
  size?: string;
  color?: string;
  design?: string;
}

export interface UnifiedOrder {
  id: string;
  storeId: string;
  orderNumber?: string;
  status:
    | "DRAFT"
    | "SENT"
    | "VIEWED"
    | "EXPIRED"
    | "ACCEPTED"
    | "PAID"
    | "CONVERTED"
    | "QUOTATION"
    | "PENDING"
    | "CANCELLED";
  token: string;
  validUntil?: string;
  expiresAt?: string; // Redundant but good for compatibility if naming changes

  // Customer Info
  customerName?: string;
  customerPhone?: string;
  email?: string;

  // Address Info (Flatted for easier form pre-fill)
  address?: string;
  address2?: string;
  city?: string;
  department?: string;
  neighborhood?: string;
  addressReference?: string;
  daneCode?: string;
  company?: string;

  // Financials
  subtotal: number;
  shippingCost?: number;
  discount?: number;
  total: number;

  // Items
  items: UnifiedOrderItem[];

  // Shipping Details
  shipping?: UnifiedShipping;

  // Metadata
  description?: string;

  createdAt: string;
  updatedAt: string;
}

export interface UnifiedShipping {
  id: string;
  envioClickIdRate?: number;
  carrierName?: string;
  cost?: number;
  status?: string;
  provider?: string;
}
