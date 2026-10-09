import { OrderType } from "@prisma/client";

export const TAX_SALE_CHANNELS = ["Tienda en línea", "Punto de venta", "Feria", "Mercado Libre"] as const;
export type TaxSaleChannel = (typeof TAX_SALE_CHANNELS)[number];

export function taxSaleChannel(type: OrderType): TaxSaleChannel {
  if (type === OrderType.POINT_OF_SALE) return "Punto de venta";
  if (type === OrderType.FESTIVAL) return "Feria";
  return "Tienda en línea";
}

/** Una línea por canal y el total presencial (punto de venta + ferias), que antes era una sola línea. */
export function summarizeTaxSalesByChannel(sales: { channel: TaxSaleChannel; totalAmount: number }[]) {
  const lines = TAX_SALE_CHANNELS.map((channel) => {
    const rows = sales.filter((sale) => sale.channel === channel);
    return { channel, count: rows.length, total: rows.reduce((sum, sale) => sum + sale.totalAmount, 0) };
  });
  const inPersonLines = lines.filter((line) => line.channel === "Punto de venta" || line.channel === "Feria");
  return {
    lines,
    inPerson: {
      count: inPersonLines.reduce((sum, line) => sum + line.count, 0),
      total: inPersonLines.reduce((sum, line) => sum + line.total, 0),
    },
  };
}
