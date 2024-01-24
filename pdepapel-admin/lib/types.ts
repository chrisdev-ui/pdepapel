import {
  Coupon,
  CouponType,
  Discount,
  DiscountType,
  Order,
  OrderItem,
  OrderStatus,
  PaymentDetails,
  PaymentMethod,
  Prisma,
  PrismaClient,
  Product,
  ProductVariant,
  ShippingStatus,
  Social,
} from "@prisma/client";
import { DefaultArgs } from "@prisma/client/runtime/library";

export interface BannersBody {
  callToAction: string;
  imageUrl: string;
}

export interface BillboardsBody {
  label: string;
  imageUrl: string;
  title?: string;
  redirectUrl?: string;
}

export interface CategoryBody {
  name: string;
  typeId: string;
}

export interface ColorBody {
  name: string;
  value: string;
}

export interface CouponBody {
  name: string;
  code: string;
  type: CouponType;
  amount: number;
  validFrom: Date;
  validUntil: Date;
}

export interface DesignBody {
  name: string;
}

export interface DiscountBody {
  name: string;
  amount: number;
  type: DiscountType;
  startDate: Date;
  endDate: Date;
  x?: number;
  y?: number;
}

export interface InventoryBody {
  variantId: string;
  quantity?: number;
  sold?: number;
  onHold?: number;
}

export interface MainBannerBody {
  title?: string;
  label1?: string;
  highlight?: string;
  label2?: string;
  callToAction: string;
  imageUrl: string;
}

export interface PostBody {
  social: Social;
  postId: string;
}

export interface ProductTagBody {
  productId: string;
  tagId: string;
}

export interface ProductVariantBody {
  productId: string;
  name: string;
  stock: number;
  price: number;
  sizeId?: string;
  colorId?: string;
  designId?: string;
  discountId?: string;
  images: {
    url: string;
  }[];
}

export interface ProductBody {
  name: string;
  price: number;
  categoryId: string;
  colorId: string;
  sizeId: string;
  designId: string;
  description: string;
  stock: number;
  images: { url: string }[];
  slug: string;
  isArchived: boolean;
  isFeatured: boolean;
}

export interface ParsedQueryParams {
  page: number;
  itemsPerPage: number;
  typeId: string[];
  categoryId: string[];
  colorId: string[];
  sizeId: string[];
  designId: string[];
  isFeatured: boolean;
  onlyNew: boolean;
  fromShop: boolean;
  limit: number | undefined;
  sortOption: string;
  priceRange: string | undefined;
  excludeProducts: string | undefined;
}

export type SortOption =
  | "default"
  | "dateAdded"
  | "priceLowToHigh"
  | "priceHighToLow"
  | "name"
  | "featuredFirst";

export type PriceRanges =
  | "[0,5000]"
  | "[5000,10000]"
  | "[10000,20000]"
  | "[20000,50000]"
  | "[50000,99999999]";

export interface ProductIncludeOptions {
  images?: boolean;
  category?: boolean;
  size?: boolean;
  color?: boolean;
  design?: boolean;
  reviews?: boolean;
}

export interface ProductVariantIncludeOptions {
  images?: boolean;
  product?: boolean;
  size?: boolean;
  color?: boolean;
  design?: boolean;
  discount?: boolean;
}

export interface ReviewBody {
  rating: number;
  comment?: string;
  userId: string;
}

export interface CloudinaryBody {
  imageUrl: string;
}

export interface SizeBody {
  name: string;
  value: string;
}

export interface TagBody {
  name: string;
}

export interface TypeBody extends TagBody {}

export interface StoreBody extends TagBody {}

export interface CheckoutOrder extends Order {
  orderItems: CheckoutOrderItem[];
  coupon: Coupon | null;
  payment?: PaymentDetails;
}

export interface CheckoutOrderItem extends OrderItem {
  product: Product;
  variant: ProductVariant & {
    discount: Discount | null;
  };
}

export interface OrderBody {
  fullName: string;
  phone: string;
  address: string;
  orderItems: { productId: string; variantId: string; quantity?: number }[];
  couponId?: string;
  status?: OrderStatus;
  payment?: {
    method: PaymentMethod;
    transactionId?: string;
  };
  shipping?: {
    status: ShippingStatus;
    courier?: string;
    cost?: number;
    trackingCode?: string;
  };
  userId?: string;
  guestId?: string;
}

export type OrderData = {
  storeId: string;
  userId: string | null;
  guestId: string | null;
  orderNumber: string;
  fullName: string;
  phone: string;
  address: string;
  orderItems: { create: any };
  couponId?: string;
  status?: any;
  payment?: { create: any };
  shipping?: { create: any };
};

export type IPrismaClient = Omit<
  PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
