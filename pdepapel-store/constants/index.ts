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
  Stripe = "Stripe",
  BankTransfer = "BankTransfer",
  Bancolombia = "Bancolombia",
}

export enum ShippingStatus {
  Preparing = "Preparing",
  Shipped = "Shipped",
  InTransit = "InTransit",
  Delivered = "Delivered",
  Returned = "Returned",
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
