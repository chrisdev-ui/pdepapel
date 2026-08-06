import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { createTaxReportWorkbook } from "@/lib/tax-report-xlsx";

describe("createTaxReportWorkbook", () => {
  it("creates the requested sales and purchases worksheets", async () => {
    const workbookBuffer = await createTaxReportWorkbook({
      period: {
        startDate: "2025-07-01",
        endDate: "2025-12-31",
        start: new Date("2025-07-01T05:00:00.000Z"),
        endExclusive: new Date("2026-01-01T05:00:00.000Z"),
      },
      salesDateBasis: "saleDate",
      sales: [
        {
          orderNumber: "ORD-001",
          customerName: "Ana Pérez",
          totalAmount: 18500,
          occurredAt: new Date("2025-07-02T05:00:00.000Z"),
        },
      ],
      purchases: [
        {
          id: "purchase-1",
          invoiceNumber: "FV-100",
          supplierName: "Proveedor S.A.S.",
          totalAmount: 42000,
          issuedAt: new Date("2025-07-03T05:00:00.000Z"),
          notes: null,
        },
      ],
      salesTotal: 18500,
      purchasesTotal: 42000,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBuffer as never);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Ventas",
      "Compras",
    ]);
    const salesSheet = workbook.getWorksheet("Ventas");
    const purchasesSheet = workbook.getWorksheet("Compras");
    if (!salesSheet || !purchasesSheet) {
      throw new Error("El libro debe incluir las hojas requeridas");
    }

    expect([
      salesSheet.getRow(1).getCell(1).value,
      salesSheet.getRow(1).getCell(2).value,
      salesSheet.getRow(1).getCell(3).value,
      salesSheet.getRow(1).getCell(4).value,
    ]).toEqual([
      "Número de orden",
      "Nombre de la persona",
      "Valor",
      "Fecha de venta",
    ]);
    expect(purchasesSheet.getRow(2).getCell(1).value).toBe("FV-100");
  });
});
