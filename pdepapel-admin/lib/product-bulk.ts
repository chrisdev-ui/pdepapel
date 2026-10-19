import { isComingSoon } from "@/lib/product-availability";
import { productLacksIdentifier } from "@/lib/product-readiness";

export type ProductBulkAction =
  | "archive"
  | "restore"
  | "feature"
  | "unfeature"
  | "mark-no-identifier"
  | "unmark-no-identifier"
  | "coming-soon"
  | "available-now";

export interface BulkProductRow {
  id: string;
  name: string;
  sku: string;
  isArchived: boolean;
  isFeatured: boolean;
  gtin?: string | null;
  mpn?: string | null;
  hasNoProductIdentifier?: boolean | null;
  availableAt?: Date | string | null;
  productGroupId?: string | null;
}

export interface BulkPartition<T> {
  eligible: T[];
  skipped: { row: T; reason: string }[];
}

/**
 * Qué filas cambian de verdad con cada acción. «Marcar sin identificador»
 * vaciaba el GTIN de todas las seleccionadas, también de las que sí tenían
 * código; ahora esas se omiten con el motivo a la vista, como en cupones.
 */
export function partitionForBulk<T extends BulkProductRow>(
  rows: T[],
  action: ProductBulkAction,
): BulkPartition<T> {
  const eligible: T[] = [];
  const skipped: { row: T; reason: string }[] = [];
  for (const row of rows) {
    const reason = skipReason(row, action);
    if (reason) skipped.push({ row, reason });
    else eligible.push(row);
  }
  return { eligible, skipped };
}

function skipReason(
  row: BulkProductRow,
  action: ProductBulkAction,
): string | null {
  switch (action) {
    case "archive":
      return row.isArchived ? "Ya está archivado" : null;
    case "restore":
      return row.isArchived ? null : "Ya está a la venta";
    case "feature":
      return row.isFeatured ? "Ya está destacado" : null;
    case "unfeature":
      return row.isFeatured ? null : "No está destacado";
    case "mark-no-identifier":
      if (row.gtin?.trim()) return `Tiene GTIN ${row.gtin.trim()}; se conserva`;
      if (row.mpn?.trim())
        return `Tiene referencia ${row.mpn.trim()}; se conserva`;
      if (row.hasNoProductIdentifier) return "Ya está marcado";
      return null;
    case "unmark-no-identifier":
      return row.hasNoProductIdentifier ? null : "No tiene la marca";
    case "coming-soon":
      return null;
    case "available-now":
      return isComingSoon(row) ? null : "Ya se vende";
  }
}

export function productLacksIdentifierRow(row: BulkProductRow): boolean {
  return productLacksIdentifier(row);
}

type CsvRow = BulkProductRow & {
  price: number;
  stock: number;
  category?: { name: string } | null;
  productGroup?: { name: string } | null;
};

const csvCell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** CSV de la selección: lo que Paula revisa o comparte con la proveedora. */
export function productsToCsv(
  rows: CsvRow[],
  currency: (value: number) => string,
): string {
  const header = [
    "SKU",
    "Nombre",
    "Subcategoría",
    "Grupo",
    "Precio",
    "Stock",
    "GTIN",
    "Estado",
  ];
  const lines = rows.map((row) =>
    [
      row.sku,
      row.name,
      row.category?.name ?? "",
      row.productGroup?.name ?? "",
      currency(row.price),
      row.stock,
      row.gtin ?? (row.hasNoProductIdentifier ? "Sin código" : ""),
      row.isArchived ? "Archivado" : "A la venta",
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

/**
 * La partición de cada edición en lote sale del campo y el valor, no de lo que
 * diga el navegador: «Marcar sin código» borra GTIN y MPN, así que el servidor
 * decide solo qué filas se omiten.
 */
export function bulkPartitionFor(field: string, value: unknown): ProductBulkAction | null {
  if (field === "isArchived") return value === true ? "archive" : value === false ? "restore" : null;
  if (field === "isFeatured") return value === true ? "feature" : value === false ? "unfeature" : null;
  if (field === "hasNoProductIdentifier") return value === true ? "mark-no-identifier" : value === false ? "unmark-no-identifier" : null;
  if (field === "availableAt") return value === null ? "available-now" : "coming-soon";
  return null;
}

/** Los motivos de omisión agrupados: «Ya está archivado» × 12. */
export function summarizeSkipped<T>(skipped: { row: T; reason: string }[]): { reason: string; count: number }[] {
  const byReason = new Map<string, number>();
  for (const { reason } of skipped) {
    // «Tiene GTIN 770…; se conserva» se agrupa sin el código.
    const key = reason.replace(/^Tiene GTIN .*; se conserva$/, "Tiene GTIN; se conserva").replace(/^Tiene referencia .*; se conserva$/, "Tiene referencia; se conserva");
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  return Array.from(byReason, ([reason, count]) => ({ reason, count }));
}
