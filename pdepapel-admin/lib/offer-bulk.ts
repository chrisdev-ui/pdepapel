import { formatDiscount, getPromotionStatus, PROMOTION_STATUS, type PromotionWindow } from "@/lib/promotion-status";

export interface BulkOfferRow extends PromotionWindow {
  id: string;
  name: string;
}

export interface BulkOfferPartition<T> {
  eligible: T[];
  skipped: { row: T; reason: string }[];
}

/** «Terminar ahora» solo tiene sentido para las que aplican hoy o van a empezar. */
export function partitionForEnd<T extends BulkOfferRow>(rows: T[], now = new Date()): BulkOfferPartition<T> {
  const eligible: T[] = [];
  const skipped: { row: T; reason: string }[] = [];
  for (const row of rows) {
    const status = getPromotionStatus(row, now);
    if (status === "vigente" || status === "programada") eligible.push(row);
    else skipped.push({ row, reason: status === "vencida" ? "Ya venció" : "Ya estaba terminada" });
  }
  return { eligible, skipped };
}

type CsvRow = BulkOfferRow & {
  label: string | null;
  type: "PERCENTAGE" | "FIXED";
  amount: number;
  scope: string;
};

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const isoDay = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

export function offersToCsv(rows: CsvRow[], currency: (value: number) => string, now = new Date()): string {
  const header = ["nombre", "etiqueta", "descuento", "aplica_a", "estado", "inicio", "fin"];
  const lines = rows.map((row) =>
    [row.name, row.label ?? "", formatDiscount(row.type, row.amount, currency), row.scope, PROMOTION_STATUS[getPromotionStatus(row, now)].label, isoDay(row.startDate), isoDay(row.endDate)].map(csvCell).join(","),
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}
