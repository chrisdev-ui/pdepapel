import { formatDiscount, getPromotionStatus, PROMOTION_STATUS, type PromotionWindow } from "@/lib/promotion-status";

export interface BulkCouponRow extends PromotionWindow {
  id: string;
  code: string;
  ordersCount: number;
}

export interface BulkPartition<T> {
  eligible: T[];
  skipped: { row: T; reason: string }[];
}

/** Solo se borran los cupones sin pedidos; los demás se omiten con el motivo a la vista. */
export function partitionForDelete<T extends BulkCouponRow>(rows: T[]): BulkPartition<T> {
  return {
    eligible: rows.filter((row) => row.ordersCount === 0),
    skipped: rows
      .filter((row) => row.ordersCount > 0)
      .map((row) => ({
        row,
        reason: `${row.ordersCount} ${row.ordersCount === 1 ? "pedido lo referencia" : "pedidos lo referencian"} · mejor desactívalo`,
      })),
  };
}

/** Se apagan los encendidos y no vencidos, la misma regla que el menú de cada fila. */
export function partitionForDeactivate<T extends BulkCouponRow>(rows: T[], now = new Date()): BulkPartition<T> {
  const eligible: T[] = [];
  const skipped: { row: T; reason: string }[] = [];
  for (const row of rows) {
    const status = getPromotionStatus(row, now);
    if (row.isActive && status !== "vencida") eligible.push(row);
    else if (!row.isActive) skipped.push({ row, reason: "Ya está desactivado" });
    else skipped.push({ row, reason: "Ya venció: el recálculo diario lo mantiene apagado" });
  }
  return { eligible, skipped };
}

type CsvRow = BulkCouponRow & {
  type: "PERCENTAGE" | "FIXED";
  amount: number;
  usedCount: number;
  minOrderValue: number | null;
};

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const isoDay = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

/** CSV con lo que Paula reparte o revisa: código, descuento, usos, estado y fechas. */
export function couponsToCsv(rows: CsvRow[], currency: (value: number) => string, now = new Date()): string {
  const header = ["codigo", "descuento", "compra_minima", "usos", "maximo_usos", "estado", "inicio", "fin"];
  const lines = rows.map((row) =>
    [
      row.code,
      formatDiscount(row.type, row.amount, currency),
      row.minOrderValue ? currency(row.minOrderValue) : "",
      row.usedCount,
      row.maxUses ?? "sin límite",
      PROMOTION_STATUS[getPromotionStatus(row, now)].label,
      isoDay(row.startDate),
      isoDay(row.endDate),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}
