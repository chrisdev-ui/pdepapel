import { ShippingCarrier } from "@/types";

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
  PickedUp = "PickedUp",
  InTransit = "InTransit",
  OutForDelivery = "OutForDelivery",
  Delivered = "Delivered",
  FailedDelivery = "FailedDelivery",
  Returned = "Returned",
  Cancelled = "Cancelled",
  Exception = "Exception",
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
    status: ShippingStatus.PickedUp,
    value: "Orden recogida",
  },
  {
    status: ShippingStatus.InTransit,
    value: "Orden en tránsito",
  },
  {
    status: ShippingStatus.OutForDelivery,
    value: "Orden en camino",
  },
  {
    status: ShippingStatus.Delivered,
    value: "Orden entregada",
  },
  {
    status: ShippingStatus.Returned,
    value: "Orden devuelta",
  },
  {
    status: ShippingStatus.Cancelled,
    value: "Orden cancelada",
  },
  {
    status: ShippingStatus.Exception,
    value: "Orden con excepción",
  },
];

export const MAX_PAGES = 4;
export const MAX_ITEMS_PER_PAGE = 52;
export const DOTS = "...";

export const BASE_URL = "https://papeleriapdepapel.com";

export const LETTER_REGEX = /^[a-zA-Z]*$/;
export const DIGIT_REGEX = /^[0-9]*$/;

export const SORT_OPTIONS = [
  { value: SortOptions.dateAdded, label: "Los más nuevos" },
  { value: SortOptions.priceLowToHigh, label: "Menor precio" },
  { value: SortOptions.priceHighToLow, label: "Mayor precio" },
  { value: SortOptions.name, label: "Nombre de producto" },
  { value: SortOptions.featuredFirst, label: "Destacados" },
];

export const ADMIN_USER_IDS = [
  "user_2YuMElx5guOjtnY3RT0vXi9UA3b",
  "user_2edvPcKn4XDbCYSobmXRNJpGq9U",
];

export const LIMIT_PER_ITEMS = 16;

export const INTERRAPIDISIMO_KEYSIZE = 256;
export const INTERRAPIDISIMO_IVSIZE = 128;
export const INTERRAPIDISIMO_SALTSIZE = 256;
export const INTERRAPIDISIMO_ITERATIONS = 1000;
export const INTERRAPIDISIMO_PASSWORD = "Int3rr4p1d1s1m0Cl4S33ncr1pc10nPt2022";

export const SHIPPINGCARRIERS: ShippingCarrier[] = [
  {
    idCarrier: 14,
    carrier: "COORDINADORA",
    code: "COORDCOL",
    comercialName: "COORDINADORA",
    logoUrl: "https://www.envioclick.com/img/paqueterias/COORDINADORA.svg",
    color: "#2d61a6",
  },
  {
    idCarrier: 17,
    carrier: "MENSAJEROS ASAP",
    code: "ASAPM",
    comercialName: "MENSAJEROS ASAP",
    logoUrl:
      "https://www.envioclickpro.com.co/img/couriers/mensajeros_asap.png",
    color: "#ffffff",
  },
  {
    idCarrier: 20,
    carrier: "DHL",
    code: "DHL",
    comercialName: "DHL",
    logoUrl: "https://www.envioclick.com/img/paqueterias/DHL.svg",
    color: "#FFCC00",
  },
  {
    idCarrier: 28,
    carrier: "ENVIA",
    code: "ENV",
    comercialName: "ENVIA",
    logoUrl: "https://www.envioclick.com/img/paqueterias/ENVIA.svg",
    color: "#c42928",
  },
  {
    idCarrier: 30,
    carrier: "99MINUTOS",
    code: "99M",
    comercialName: "99 MINUTOS",
    logoUrl: "https://www.envioclick.com/img/paqueterias/99MINUTOS.svg",
    color: "#85C440",
  },
  {
    idCarrier: 40,
    carrier: "MENSAJEROS_URBANOS_EXPRESS",
    code: "MUE",
    comercialName: "Mensajeros Urbanos EXPRESS",
    logoUrl: "https://www.envioclick.com/img/paqueterias/MENSAJEROSURBANOS.svg",
    color: "#E4F7FA",
  },
  {
    idCarrier: 44,
    carrier: "TCC",
    code: "TCC",
    comercialName: "Tcc",
    logoUrl: "https://www.envioclick.com/img/paqueterias/TCC.svg",
    color: "#cd413f",
  },
  {
    idCarrier: 46,
    carrier: "INTERRAPIDISIMO",
    code: "INTER",
    comercialName: "INTERRAPIDISIMO",
    logoUrl: "https://www.envioclick.com/img/paqueterias/INTERRAPIDISIMO.svg",
    color: "#000000",
  },
  {
    idCarrier: 49,
    carrier: "PIBOX",
    code: "PIBOX",
    comercialName: "Pibox",
    logoUrl: "https://www.envioclick.com/img/paqueterias/PIBOX.svg",
    color: "#6f2bb6",
  },
  {
    idCarrier: 64,
    carrier: "DEPRISA",
    code: "DEPRISA",
    comercialName: "DEPRISA",
    logoUrl: "https://www.envioclickpro.com.co/img/couriers/deprisa.png",
    color: "#ffffff",
  },
  {
    idCarrier: 1,
    carrier: "SERVIENTREGA",
    code: "SERVIENTREGA",
    comercialName: "SERVIENTREGA",
    logoUrl: "https://www.envioclick.com/img/paqueterias/SERVIENTREGA.svg",
    color: "#55a962",
  },
];

import { Season, SeasonConfig } from "@/types";

export const SEASON_CONFIG: Record<Season, SeasonConfig> = {
  [Season.Default]: {
    navbarText: "/images/text-beside-transparent-bg.webp",
    navbarNoText: "/images/no-text-transparent-bg.webp",
    checkoutSuffix: "",
  },
  [Season.Christmas]: {
    navbarText: "/images/text-beside-transparent-bg-christmas.webp",
    navbarNoText: "/images/no-text-transparent-bg-christmas.webp",
    checkoutSuffix: "-christmas",
  },
};
