import { PriceRange } from "@/types";

export const DELAY = 5000;
export const TOAST_DURATION = 2000;
export const KAWAII_FACE_EXCITED = `(,,>﹏<,,)`;
export const KAWAII_FACE_SAD = `(｡-_-｡)`;
export const KAWAII_FACE_HAPPY = `٩(ˊᗜˋ*)و ♡`;
export const KAWAII_FACE_WELCOME = `｡◕ ‿ ◕｡`;

export enum SortOptions {
  priceLowToHigh = "priceLowToHigh",
  priceHighToLow = "priceHighToLow",
  name = "name",
  dateAdded = "dateAdded",
  featuredFirst = "featuredFirst",
}

export enum OrderStatus {
  CREATED = "CREATED",
  PENDING = "PENDING",
  PAID = "PAID",
  CANCELLED = "CANCELLED",
}

export enum PaymentMethod {
  COD = "COD",
  BankTransfer = "BankTransfer",
  Wompi = "Wompi",
  PayU = "PayU",
}

export enum ShippingStatus {
  Preparing = "Preparing",
  Shipped = "Shipped",
  InTransit = "InTransit",
  Delivered = "Delivered",
  Returned = "Returned",
}

export enum Social {
  Facebook = "Facebook",
  Instagram = "Instagram",
  Twitter = "Twitter",
  TikTok = "TikTok",
  Pinterest = "Pinterest",
  Youtube = "Youtube",
}

export const steps: { status: string; value: string }[] = [
  {
    status: ShippingStatus.Preparing,
    value: "Orden en preparación",
  },
  {
    status: ShippingStatus.Shipped,
    value: "Orden despachada",
  },
  {
    status: ShippingStatus.InTransit,
    value: "Orden en tránsito",
  },
  {
    status: ShippingStatus.Delivered,
    value: "Orden entregada",
  },
  {
    status: ShippingStatus.Returned,
    value: "Orden devuelta",
  },
];

export const MAX_PAGES = 4;
export const MAX_ITEMS_PER_PAGE = 52;
export const DOTS = "...";

export const LETTER_REGEX = /^[a-zA-Z]*$/;
export const DIGIT_REGEX = /^[0-9]*$/;

export const SORT_OPTIONS = [
  { value: SortOptions.dateAdded, label: "Los más nuevos" },
  { value: SortOptions.priceLowToHigh, label: "Menor precio" },
  { value: SortOptions.priceHighToLow, label: "Mayor precio" },
  { value: SortOptions.name, label: "Nombre de producto" },
  { value: SortOptions.featuredFirst, label: "Destacados" },
];

export const PRICES: PriceRange[] = [
  { id: "[0,5000]", name: "Menos de $5,000" },
  { id: "[5000,10000]", name: "Entre $5,000 y $10,000" },
  { id: "[10000,20000]", name: "Entre $10,000 y $20,000" },
  { id: "[20000,50000]", name: "Entre $20,000 y $50,000" },
  { id: "[50000,99999999]", name: "Más de $50,000" },
];
