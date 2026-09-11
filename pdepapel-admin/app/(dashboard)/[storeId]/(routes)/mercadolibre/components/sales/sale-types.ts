import type { SalesViewOrder } from "@/lib/mercadolibre/sales-views";

/** Fila de la lista de ventas, tal como la entrega GET …/historical-sales. */
export type MarketplaceSale = SalesViewOrder & {
  id: string;
  externalOrderId: string;
  externalPackId: string | null;
  inventoryError: string | null;
  buyerName: string | null;
  paidAt: string | null;
  createdAt: string;
  totalAmount: number | null;
  marketplaceFee: number | null;
  shippingCost: number | null;
  taxesAmount: number | null;
  refundedAmount: number | null;
  refundReason: string | null;
  items: {
    title: string;
    quantity: number;
    unitPrice: number;
    product: { name: string; sku: string } | null;
  }[];
};

export type SalesResponse = {
  data: MarketplaceSale[];
  total: number;
  linkedSale: MarketplaceSale | null;
};

export type SaleFeedback = { type: "error" | "success"; message: string };

export const saleCurrency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** «—» cuando el dato no existe: un cero inventado se lee como cifra conocida. */
export function formatSaleAmount(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : saleCurrency.format(value);
}

export function formatSaleDate(value: string | null) {
  if (!value) return "Sin fecha de pago";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

export function getResponseError(response: Response) {
  return response
    .json()
    .then(
      (body: { error?: string }) =>
        body.error ?? "No fue posible completar la acción",
    )
    .catch(() => "No fue posible completar la acción");
}
