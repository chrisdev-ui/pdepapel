import { OrderStatus, PaymentMethod, ShippingStatus } from "@prisma/client";

export const DEFAULT_COUNTRY = "CO";

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

export const SORT_OPTIONS: Record<
  SortOption,
  Record<string, "asc" | "desc">
> = {
  default: { createdAt: "desc" },
  dateAdded: { createdAt: "desc" },
  priceLowToHigh: { price: "asc" },
  priceHighToLow: { price: "desc" },
  name: { name: "asc" },
  featuredFirst: { isFeatured: "desc" },
};
export const PRICE_RANGES = {
  "[0,5000]": { gte: 0, lte: 5000 },
  "[5000,10000]": { gte: 5000, lte: 10000 },
  "[10000,20000]": { gte: 10000, lte: 20000 },
  "[20000,50000]": { gte: 20000, lte: 50000 },
  "[50000,99999999]": { gte: 50000 },
};

export const START_YEAR = 2023;

export const statusOptions = {
  [OrderStatus.CREATED]: "Creada",
  [OrderStatus.PENDING]: "Pendiente",
  [OrderStatus.PAID]: "Pagada",
  [OrderStatus.CANCELLED]: "Cancelada",
};

export const paymentOptions = {
  [PaymentMethod.BankTransfer]: "Transferencia bancaria",
  [PaymentMethod.COD]: "Contra entrega",
  [PaymentMethod.PayU]: "PayU",
  [PaymentMethod.Wompi]: "Wompi",
};

export const shippingOptions = {
  [ShippingStatus.Preparing]: "En preparación",
  [ShippingStatus.Shipped]: "Enviada",
  [ShippingStatus.InTransit]: "En tránsito",
  [ShippingStatus.Delivered]: "Entregada",
  [ShippingStatus.Returned]: "Devuelta",
};

export const detailsTitleOptions: { [key: string]: string } = {
  customer_email: "Correo electrónico del cliente",
  payment_method_type: "Tipo de método de pago",
  reference_pol: "Número de orden",
};

type WompiPaymentMethods = {
  [key in
    | "CARD"
    | "BANCOLOMBIA_TRANSFER"
    | "BANCOLOMBIA_QR"
    | "NEQUI"
    | "PSE"
    | "PCOL"
    | string]: string;
};

export const paymentMethodsByOption: {
  [P in PaymentMethod]: WompiPaymentMethods | null;
} = {
  [PaymentMethod.Wompi]: {
    CARD: "Tarjeta de crédito",
    BANCOLOMBIA_TRANSFER: "Transferencia bancaria Bancolombia",
    BANCOLOMBIA_QR: "Código QR",
    NEQUI: "Nequi",
    PSE: "PSE",
    PCOL: "Puntos Colombia",
  },
  [PaymentMethod.PayU]: null,
  [PaymentMethod.BankTransfer]: null,
  [PaymentMethod.COD]: null,
};

export const INITIAL_PERCENTAGE_INCREASE = 100;
export const INITIAL_TRANSPORTATION_COST = 500;
export const INITIAL_MISC_COST = 500;

export const yearColors = {
  2025: "#AD8FE1",
  default: "#3498DB",
};
