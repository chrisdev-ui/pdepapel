import { createHash } from "crypto";

import { InventoryMovementType } from "@prisma/client";
import ExcelJS from "exceljs";

export const RECONCILIATION_SHEET_NAME = "CONCILIACIÓN";
export const RECONCILIATION_HEADERS = {
  sku: "SKU / etiqueta",
  product: "Producto y variante",
  systemStock: "Stock sistema",
  physicalCount: "Conteo físico disponible",
  difference: "Diferencia",
  cause: "Causa",
  action: "Acción sugerida",
  quantity: "Cantidad a aplicar",
  reason: "Razón del movimiento",
  details: "Detalles / evidencia",
  review: "Revisión",
  status: "Estado",
  authorize: "Autorizar carga",
} as const;

export const RECONCILIATION_CAUSES = [
  "Venta presencial ya registrada",
  "Daño",
  "Pérdida",
  "Promoción/obsequio",
  "Uso interno",
  "Compra no registrada",
  "Diferencia sin causa confirmada",
] as const;

export type ReconciliationCause = (typeof RECONCILIATION_CAUSES)[number];

type ColumnKey = keyof typeof RECONCILIATION_HEADERS;

export type ParsedReconciliationRow = {
  rowNumber: number;
  sku: string;
  productName: string;
  expectedStock: number | null;
  physicalCount: number | null;
  cause: ReconciliationCause | null;
  reason: string;
  description: string;
  reviewed: boolean;
  authorized: boolean;
  errors: string[];
};

export type ReconciliationCatalogProduct = {
  id: string;
  sku: string;
  name: string;
  stock: number;
  isArchived: boolean;
  isKit: boolean;
  hasActiveFairAllocation: boolean;
};

export type ReconciliationPreviewRow = ParsedReconciliationRow & {
  productId: string | null;
  currentStock: number | null;
  difference: number | null;
  movementType: InventoryMovementType | null;
  status: "ready" | "skipped" | "error";
};

export type ReconciliationPreview = {
  rows: ReconciliationPreviewRow[];
  readyRows: ReconciliationPreviewRow[];
  totalRows: number;
  readyCount: number;
  skippedCount: number;
  errorCount: number;
  importReference: string | null;
};

const headerAliases: Record<ColumnKey, string[]> = {
  sku: ["sku etiqueta", "sku", "etiqueta"],
  product: ["producto y variante", "producto variante", "producto"],
  systemStock: ["stock sistema"],
  physicalCount: ["conteo fisico disponible", "conteo fisico"],
  difference: ["diferencia"],
  cause: ["causa"],
  action: ["accion sugerida"],
  quantity: ["cantidad a aplicar"],
  reason: ["razon del movimiento", "razon"],
  details: ["detalles evidencia", "detalles"],
  review: ["revision"],
  status: ["estado"],
  authorize: ["autorizar carga", "autorizar"],
};

const causeByNormalizedValue = new Map<string, ReconciliationCause>(
  RECONCILIATION_CAUSES.map((cause) => [normalizeText(cause), cause]),
);

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CO")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getCellText(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return "";
  const { value } = cell;

  if (value && typeof value === "object" && "result" in value) {
    return String(value.result ?? "").trim();
  }

  return String(value ?? "").trim();
}

function parseWholeNumber(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "");
  if (!normalized) return null;

  const withoutThousands = /^[+-]?\d{1,3}([.,]\d{3})+$/.test(normalized)
    ? normalized.replace(/[.,]/g, "")
    : normalized;
  const number = Number(withoutThousands);

  return Number.isInteger(number) && number >= 0 ? number : null;
}

function isYes(value: string): boolean {
  return ["si", "yes", "true", "1"].includes(normalizeText(value));
}

function isReviewed(value: string): boolean {
  return normalizeText(value) === "revisado";
}

function findHeaderRow(sheet: ExcelJS.Worksheet): {
  rowNumber: number;
  columns: Partial<Record<ColumnKey, number>>;
} {
  for (
    let rowNumber = 1;
    rowNumber <= Math.min(sheet.rowCount, 25);
    rowNumber += 1
  ) {
    const row = sheet.getRow(rowNumber);
    const columns: Partial<Record<ColumnKey, number>> = {};

    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const normalizedHeader = normalizeText(getCellText(cell));
      for (const [key, aliases] of Object.entries(headerAliases) as [
        ColumnKey,
        string[],
      ][]) {
        if (aliases.includes(normalizedHeader)) columns[key] = columnNumber;
      }
    });

    if (columns.sku && columns.systemStock && columns.physicalCount) {
      return { rowNumber, columns };
    }
  }

  throw new Error(
    "No encontramos los encabezados de la plantilla. Descarga una plantilla nueva desde el panel y úsala sin cambiar los títulos.",
  );
}

function getRowCellText(
  row: ExcelJS.Row,
  columns: Partial<Record<ColumnKey, number>>,
  key: ColumnKey,
): string {
  const column = columns[key];
  return column ? getCellText(row.getCell(column)) : "";
}

function getMovementType(
  cause: ReconciliationCause,
  difference: number,
): InventoryMovementType | null {
  if (difference === 0) return null;

  if (cause === "Daño") return InventoryMovementType.DAMAGE;
  if (cause === "Pérdida") return InventoryMovementType.LOST;
  if (cause === "Promoción/obsequio") return InventoryMovementType.PROMOTION;
  if (cause === "Uso interno") return InventoryMovementType.STORE_USE;

  return InventoryMovementType.MANUAL_ADJUSTMENT;
}

function validateCauseDirection(
  cause: ReconciliationCause,
  difference: number,
) {
  const mustRemove = ["Daño", "Pérdida", "Promoción/obsequio", "Uso interno"];
  if (mustRemove.includes(cause) && difference >= 0) {
    return `La causa ${cause} solo puede usarse cuando se debe restar inventario.`;
  }
  if (cause === "Compra no registrada" && difference <= 0) {
    return "Compra no registrada solo puede usarse cuando se debe agregar inventario.";
  }
  return null;
}

export async function parseReconciliationWorkbook(
  fileBuffer: Buffer,
): Promise<ParsedReconciliationRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const sheet = workbook.getWorksheet(RECONCILIATION_SHEET_NAME);

  if (!sheet) {
    throw new Error(
      `No encontramos la hoja ${RECONCILIATION_SHEET_NAME}. Descarga una plantilla nueva desde el panel.`,
    );
  }

  const { rowNumber: headerRowNumber, columns } = findHeaderRow(sheet);
  const rows: ParsedReconciliationRow[] = [];

  for (
    let rowNumber = headerRowNumber + 1;
    rowNumber <= sheet.rowCount;
    rowNumber += 1
  ) {
    const worksheetRow = sheet.getRow(rowNumber);
    const sku = getRowCellText(worksheetRow, columns, "sku").toUpperCase();
    const productName = getRowCellText(worksheetRow, columns, "product");
    const systemStockValue = getRowCellText(
      worksheetRow,
      columns,
      "systemStock",
    );
    const physicalCountValue = getRowCellText(
      worksheetRow,
      columns,
      "physicalCount",
    );
    const causeValue = getRowCellText(worksheetRow, columns, "cause");
    const reason = getRowCellText(worksheetRow, columns, "reason");
    const description = getRowCellText(worksheetRow, columns, "details");
    const reviewValue = getRowCellText(worksheetRow, columns, "review");
    const authorizationValue = getRowCellText(
      worksheetRow,
      columns,
      "authorize",
    );

    const containsUserData = [
      sku,
      productName,
      systemStockValue,
      physicalCountValue,
      causeValue,
      description,
      reviewValue,
      authorizationValue,
    ].some(Boolean);
    if (!containsUserData) continue;

    const errors: string[] = [];
    const expectedStock = parseWholeNumber(systemStockValue);
    const physicalCount = parseWholeNumber(physicalCountValue);
    const cause = causeByNormalizedValue.get(normalizeText(causeValue)) ?? null;

    if (!sku) errors.push("Falta el SKU o etiqueta del producto.");
    if (expectedStock === null) {
      errors.push(
        "Stock sistema debe ser un número entero igual o mayor que cero.",
      );
    }
    if (physicalCount === null) {
      errors.push(
        "Conteo físico disponible debe ser un número entero igual o mayor que cero.",
      );
    }

    rows.push({
      rowNumber,
      sku,
      productName,
      expectedStock,
      physicalCount,
      cause,
      reason,
      description,
      reviewed: isReviewed(reviewValue),
      authorized: isYes(authorizationValue),
      errors,
    });
  }

  if (rows.length === 0) {
    throw new Error("La plantilla no tiene productos para revisar.");
  }

  return rows;
}

export function prepareReconciliationPreview(
  parsedRows: ParsedReconciliationRow[],
  catalogProducts: ReconciliationCatalogProduct[],
  storeId: string,
): ReconciliationPreview {
  const productsBySku = new Map(
    catalogProducts.map((product) => [product.sku.toUpperCase(), product]),
  );
  const authorizedSkuCounts = new Map<string, number>();

  parsedRows.forEach((row) => {
    if (!row.authorized || !row.sku) return;
    authorizedSkuCounts.set(
      row.sku,
      (authorizedSkuCounts.get(row.sku) ?? 0) + 1,
    );
  });

  const rows = parsedRows.map<ReconciliationPreviewRow>((row) => {
    const errors = [...row.errors];
    const product = productsBySku.get(row.sku);
    const difference =
      row.expectedStock === null || row.physicalCount === null
        ? null
        : row.physicalCount - row.expectedStock;

    if (!row.authorized) {
      return {
        ...row,
        productId: product?.id ?? null,
        currentStock: product?.stock ?? null,
        difference,
        movementType: null,
        status: "skipped",
      };
    }

    if (!row.reviewed)
      errors.push("Marca Revisado antes de autorizar esta fila.");
    if ((authorizedSkuCounts.get(row.sku) ?? 0) > 1) {
      errors.push("El SKU está autorizado más de una vez en el archivo.");
    }
    if (!product) {
      errors.push("No encontramos este SKU en la tienda.");
    } else {
      if (product.isArchived) errors.push("El producto está archivado.");
      if (product.isKit)
        errors.push("Los kits se ajustan contando sus componentes.");
      if (product.hasActiveFairAllocation) {
        errors.push("El producto tiene unidades en una feria activa.");
      }
      if (row.expectedStock !== null && product.stock !== row.expectedStock) {
        errors.push(
          `El stock actual (${product.stock}) cambió desde el conteo de la plantilla (${row.expectedStock}).`,
        );
      }
    }

    if (difference === null) {
      errors.push("No fue posible calcular la diferencia de inventario.");
    } else if (difference !== 0) {
      if (!row.cause) errors.push("Selecciona una causa para la diferencia.");
      if (row.cause) {
        const directionError = validateCauseDirection(row.cause, difference);
        if (directionError) errors.push(directionError);
      }
    }

    if (errors.length > 0) {
      return {
        ...row,
        productId: product?.id ?? null,
        currentStock: product?.stock ?? null,
        difference,
        movementType:
          row.cause && difference !== null
            ? getMovementType(row.cause, difference)
            : null,
        errors,
        status: "error",
      };
    }

    if (difference === 0) {
      return {
        ...row,
        productId: product?.id ?? null,
        currentStock: product?.stock ?? null,
        difference,
        movementType: null,
        status: "skipped",
      };
    }

    return {
      ...row,
      productId: product?.id ?? null,
      currentStock: product?.stock ?? null,
      difference,
      movementType: getMovementType(row.cause!, difference),
      status: "ready",
    };
  });

  const readyRows = rows.filter((row) => row.status === "ready");
  const errorCount = rows.filter((row) => row.status === "error").length;
  const skippedCount = rows.filter((row) => row.status === "skipped").length;
  const importReference =
    readyRows.length > 0 ? createImportReference(storeId, readyRows) : null;

  return {
    rows,
    readyRows,
    totalRows: rows.length,
    readyCount: readyRows.length,
    skippedCount,
    errorCount,
    importReference,
  };
}

function createImportReference(
  storeId: string,
  rows: ReconciliationPreviewRow[],
): string {
  const normalizedRows = rows
    .map((row) => ({
      sku: row.sku,
      expectedStock: row.expectedStock,
      physicalCount: row.physicalCount,
      cause: row.cause,
      reason: row.reason || "Conciliación de feria anterior",
      description: row.description,
    }))
    .sort((left, right) => left.sku.localeCompare(right.sku));
  const digest = createHash("sha256")
    .update(JSON.stringify({ storeId, rows: normalizedRows }))
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();

  return `FAIR_RECONCILIATION_${digest}`;
}

export function getReconciliationMovementType(
  cause: ReconciliationCause,
  difference: number,
) {
  return getMovementType(cause, difference);
}
