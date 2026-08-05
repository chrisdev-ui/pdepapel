import ExcelJS from "exceljs";

import type { TaxReport } from "@/lib/tax-reports";

const COP_FORMAT = '"$"#,##0';
const DATE_FORMAT = "dd/mm/yyyy";

function configureSheet(
  sheet: ExcelJS.Worksheet,
  columns: Partial<ExcelJS.Column>[],
) {
  sheet.columns = columns;
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A5F" },
  };
  headerRow.alignment = { vertical: "middle" };
}

export async function createTaxReportWorkbook(report: TaxReport) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "P de Papel";
  workbook.created = new Date();
  workbook.modified = new Date();

  const salesSheet = workbook.addWorksheet("Ventas");
  salesSheet.addRow(["Número de orden", "Nombre de la persona", "Valor", "Fecha"]);
  configureSheet(salesSheet, [
    { key: "orderNumber", width: 24 },
    { key: "customerName", width: 32 },
    { key: "totalAmount", width: 18 },
    { key: "occurredAt", width: 16 },
  ]);

  report.sales.forEach((sale) => {
    const row = salesSheet.addRow(sale);
    row.getCell("totalAmount").numFmt = COP_FORMAT;
    row.getCell("occurredAt").numFmt = DATE_FORMAT;
  });
  salesSheet.autoFilter = "A1:D1";

  const purchasesSheet = workbook.addWorksheet("Compras");
  purchasesSheet.addRow([
    "Número de factura",
    "Nombre de la empresa",
    "Valor",
    "Fecha",
  ]);
  configureSheet(purchasesSheet, [
    { key: "invoiceNumber", width: 24 },
    { key: "supplierName", width: 32 },
    { key: "totalAmount", width: 18 },
    { key: "issuedAt", width: 16 },
  ]);

  report.purchases.forEach((purchase) => {
    const row = purchasesSheet.addRow(purchase);
    row.getCell("totalAmount").numFmt = COP_FORMAT;
    row.getCell("issuedAt").numFmt = DATE_FORMAT;
  });
  purchasesSheet.autoFilter = "A1:D1";

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
