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
