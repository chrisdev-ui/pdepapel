import ExcelJS from "exceljs";
import { InventoryMovementType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  parseReconciliationWorkbook,
  prepareReconciliationPreview,
  RECONCILIATION_HEADERS,
  RECONCILIATION_SHEET_NAME,
  type ParsedReconciliationRow,
} from "@/lib/fair-reconciliation-import";
import { createFairReconciliationTemplateWorkbook } from "@/lib/fair-reconciliation-template-xlsx";

const reviewedRow: ParsedReconciliationRow = {
  rowNumber: 7,
  sku: "LAP-001",
  productName: "Lapicero pastel",
  expectedStock: 12,
  physicalCount: 7,
  cause: "Venta presencial ya registrada",
  reason: "Conciliación de feria anterior",
  description: "Feria de julio",
  reviewed: true,
  authorized: true,
  errors: [],
};

const catalogProduct = {
  id: "product-1",
  sku: "LAP-001",
  name: "Lapicero pastel",
  stock: 12,
  isArchived: false,
  isKit: false,
  hasActiveFairAllocation: false,
};

describe("fair reconciliation import", () => {
  it("parses only the editable reconciliation values from a workbook", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(RECONCILIATION_SHEET_NAME);
    sheet.getRow(3).values = Object.values(RECONCILIATION_HEADERS);
    sheet.getRow(4).values = [
      "LAP-001",
      "Lapicero pastel",
      12,
      7,
      { formula: "D4-C4", result: -5 },
      "Venta presencial ya registrada",
      { formula: '"Restar (-)"', result: "Restar (-)" },
      { formula: "ABS(E4)", result: 5 },
      "Conciliación de feria anterior",
      "Feria de julio",
      "Revisado",
      { formula: '"Listo para cargar"', result: "Listo para cargar" },
      "Sí",
    ];

    const rows = await parseReconciliationWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer()),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        sku: "LAP-001",
        expectedStock: 12,
        physicalCount: 7,
        cause: "Venta presencial ya registrada",
        reviewed: true,
        authorized: true,
        errors: [],
      }),
    ]);
  });

  it("prepares a signed manual adjustment for a reviewed physical-count difference", () => {
    const preview = prepareReconciliationPreview(
      [reviewedRow],
      [catalogProduct],
      "store-1",
    );

    expect(preview.errorCount).toBe(0);
    expect(preview.readyCount).toBe(1);
    expect(preview.readyRows[0]).toEqual(
      expect.objectContaining({
        productId: "product-1",
        difference: -5,
        movementType: InventoryMovementType.MANUAL_ADJUSTMENT,
        status: "ready",
      }),
    );
    expect(preview.importReference).toMatch(/^FAIR_RECONCILIATION_/);
  });

  it("blocks stale inventory, active fairs, kits and invalid cause directions", () => {
    const preview = prepareReconciliationPreview(
      [
        reviewedRow,
        {
          ...reviewedRow,
          rowNumber: 8,
          sku: "KIT-001",
          productName: "Kit",
          expectedStock: 4,
          physicalCount: 5,
          cause: "Daño",
        },
      ],
      [
        { ...catalogProduct, stock: 10, hasActiveFairAllocation: true },
        {
          ...catalogProduct,
          id: "kit-1",
          sku: "KIT-001",
          name: "Kit",
          stock: 4,
          isKit: true,
          hasActiveFairAllocation: false,
        },
      ],
      "store-1",
    );

    expect(preview.readyCount).toBe(0);
    expect(preview.errorCount).toBe(2);
    expect(preview.rows[0].errors).toEqual(
      expect.arrayContaining([
        "El producto tiene unidades en una feria activa.",
        "El stock actual (10) cambió desde el conteo de la plantilla (12).",
      ]),
    );
    expect(preview.rows[1].errors).toEqual(
      expect.arrayContaining([
        "Los kits se ajustan contando sus componentes.",
        "La causa Daño solo puede usarse cuando se debe restar inventario.",
      ]),
    );
  });

  it("creates a prefilled template that can be read by the importer", async () => {
    const buffer = await createFairReconciliationTemplateWorkbook([
      { sku: "LAP-001", name: "Lapicero pastel", stock: 12 },
    ]);
    const rows = await parseReconciliationWorkbook(buffer);

    expect(rows).toEqual([
      expect.objectContaining({
        sku: "LAP-001",
        productName: "Lapicero pastel",
        expectedStock: 12,
        physicalCount: null,
        authorized: false,
      }),
    ]);
  });
});
