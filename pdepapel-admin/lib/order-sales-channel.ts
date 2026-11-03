import { OrderSalesChannel, OrderSource } from "@prisma/client";

/** Order of the chips in the panel: the usual channels first. */
export const SALES_CHANNELS: readonly OrderSalesChannel[] = [
  OrderSalesChannel.WHATSAPP,
  OrderSalesChannel.INSTAGRAM,
  OrderSalesChannel.TIKTOK,
  OrderSalesChannel.PRESENCIAL,
  OrderSalesChannel.FERIA,
  OrderSalesChannel.OTRO,
];

export const SALES_CHANNEL_LABELS: Record<OrderSalesChannel, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  PRESENCIAL: "Presencial",
  FERIA: "Feria",
  OTRO: "Otro",
};

export function parseSalesChannel(value: unknown): OrderSalesChannel | null {
  return typeof value === "string" && (SALES_CHANNELS as readonly string[]).includes(value) ? (value as OrderSalesChannel) : null;
}

/** The waitlist already records where the customer asked from; WEB is the online store, so no channel. */
export function salesChannelFromWaitlist(channel: string | null | undefined): OrderSalesChannel | null {
  switch (channel) {
    case "WHATSAPP":
      return OrderSalesChannel.WHATSAPP;
    case "INSTAGRAM":
      return OrderSalesChannel.INSTAGRAM;
    case "TIKTOK":
      return OrderSalesChannel.TIKTOK;
    case "OTHER":
      return OrderSalesChannel.OTRO;
    default:
      return null;
  }
}

/** «Ventas por canal»: the chosen channel; otherwise what the writing system implies; panel orders without one are «Sin registrar». */
export type SalesReportChannel = OrderSalesChannel | "TIENDA" | "SIN_REGISTRAR";

export function reportChannelOf(order: { salesChannel: OrderSalesChannel | null; source: OrderSource | null }): SalesReportChannel {
  if (order.salesChannel) return order.salesChannel;
  switch (order.source) {
    case OrderSource.STORE:
      return "TIENDA";
    case OrderSource.WHATSAPP:
      return OrderSalesChannel.WHATSAPP;
    case OrderSource.POS:
      return OrderSalesChannel.PRESENCIAL;
    case OrderSource.FAIR:
      return OrderSalesChannel.FERIA;
    default:
      return "SIN_REGISTRAR";
  }
}

export const REPORT_CHANNEL_LABELS: Record<SalesReportChannel, string> = {
  ...SALES_CHANNEL_LABELS,
  TIENDA: "Tienda en línea",
  SIN_REGISTRAR: "Sin registrar",
};
