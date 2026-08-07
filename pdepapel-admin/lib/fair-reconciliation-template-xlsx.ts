import ExcelJS from "exceljs";

import {
  RECONCILIATION_CAUSES,
  RECONCILIATION_HEADERS,
  RECONCILIATION_SHEET_NAME,
} from "@/lib/fair-reconciliation-import";

export type ReconciliationTemplateProduct = {
  sku: string;
  name: string;
  stock: number;
};

const NAVY = "FF26214C";
const PINK = "FFFF7DA5";
const MINT = "FFE5F7EE";
const GRAY = "FFF4F4F5";
const WHITE = "FFFFFFFF";

const headers = Object.values(RECONCILIATION_HEADERS);

function styleHeader(row: ExcelJS.Row) {
  row.height = 28;
  row.font = { bold: true, color: { argb: WHITE } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function addInstructionSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet("LEEME");
  sheet.columns = [{ width: 28 }, { width: 100 }];
  sheet.mergeCells("A1:B1");
  const title = sheet.getCell("A1");
  title.value = "Conciliación de inventario de una feria anterior";
  title.font = { bold: true, size: 16, color: { argb: WHITE } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  title.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 32;

  const steps = [
    [
      "1. No cambies estos datos",
      "SKU, producto y Stock sistema vienen del panel. No los edites.",
    ],
    [
      "2. Cuenta lo que sí está disponible",
      "Escribe cuántas unidades reales quedan para vender de cada producto.",
    ],
    [
      "3. Explica cada diferencia",
      "Si el conteo es distinto, selecciona una causa y deja una nota si ayuda a recordarla.",
    ],
    [
      "4. Revisa con calma",
      "Pon Revisado solo cuando hayas comparado el producto físico con esta fila.",
    ],
    [
      "5. Autoriza al final",
      "Pon Sí en Autorizar carga únicamente en las filas que quieres aplicar.",
    ],
    [
      "Importante",
      "Este archivo solo corrige cantidades. No crea ventas ni modifica los pedidos ya registrados.",
    ],
    [
      "No uses este archivo si",
      "Hay una feria activa con ese producto, alguien está ajustando inventario o descargaste la plantilla hace mucho. Descarga una nueva.",
    ],
  ];

  steps.forEach(([label, text], index) => {
    const row = sheet.getRow(index + 3);
    row.getCell(1).value = label;
    row.getCell(2).value = text;
    row.getCell(1).font = { bold: true, color: { argb: NAVY } };
    row.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFCE7EF" },
    };
    row.alignment = { vertical: "top", wrapText: true };
    row.height = 42;
  });
}

function addParametersSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet("PARÁMETROS");
  sheet.columns = [{ width: 34 }, { width: 52 }];
  sheet.mergeCells("A1:B1");
  const title = sheet.getCell("A1");
  title.value = "Datos para recordar esta conciliación";
  title.font = { bold: true, size: 16, color: { argb: WHITE } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  sheet.getRow(1).height = 32;

  [
    "Nombre de la feria",
    "Fecha de la feria",
    "Quién contó",
    "Quién revisó",
    "Notas generales",
  ].forEach((label, index) => {
    const row = sheet.getRow(index + 3);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true, color: { argb: NAVY } };
    row.getCell(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: MINT },
    };
    row.getCell(2).border = {
      bottom: { style: "thin", color: { argb: "FFB7C6BE" } },
    };
    row.height = label === "Notas generales" ? 58 : 28;
    row.alignment = { vertical: "top", wrapText: true };
  });
}

export async function createFairReconciliationTemplateWorkbook(
  products: ReconciliationTemplateProduct[],
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "P de Papel";
  workbook.created = new Date();
  workbook.modified = new Date();

  addInstructionSheet(workbook);
  addParametersSheet(workbook);

  const sheet = workbook.addWorksheet(RECONCILIATION_SHEET_NAME);
  sheet.views = [{ state: "frozen", ySplit: 6 }];
  sheet.columns = [
    { width: 22 },
    { width: 42 },
    { width: 15 },
    { width: 25 },
    { width: 14 },
    { width: 29 },
    { width: 21 },
    { width: 20 },
    { width: 34 },
    { width: 42 },
    { width: 16 },
    { width: 24 },
    { width: 20 },
  ];

  sheet.mergeCells("A1:M1");
  const title = sheet.getCell("A1");
  title.value =
    "Cuenta el inventario físico y autoriza solo las filas revisadas";
  title.font = { bold: true, size: 15, color: { argb: WHITE } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  title.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 30;

  sheet.mergeCells("A3:M3");
  sheet.getCell("A3").value =
    "Completa únicamente las celdas verdes. Las grises se calculan solas. Si una fila no debe cambiar, deja Autorizar carga vacío.";
  sheet.getCell("A3").font = { italic: true, color: { argb: "FF4B5563" } };

  const headerRow = sheet.getRow(6);
  headerRow.values = headers;
  styleHeader(headerRow);
  sheet.autoFilter = `A6:M${Math.max(7, products.length + 6)}`;

  products.forEach((product, index) => {
    const rowNumber = index + 7;
    const row = sheet.getRow(rowNumber);
    row.values = [
      product.sku,
      product.name,
      product.stock,
      null,
      { formula: `IF(D${rowNumber}=\"\",\"\",D${rowNumber}-C${rowNumber})` },
      null,
      {
        formula: `IF(E${rowNumber}=\"\",\"\",IF(E${rowNumber}=0,\"Sin cambio\",IF(E${rowNumber}>0,\"Agregar (+)\",\"Restar (-)\")))`,
      },
      { formula: `IF(E${rowNumber}=\"\",\"\",ABS(E${rowNumber}))` },
      "Conciliación de feria anterior",
      null,
      null,
      {
        formula: `IF(M${rowNumber}<>\"Sí\",\"Sin autorizar\",IF(K${rowNumber}<>\"Revisado\",\"Falta revisión\",IF(D${rowNumber}=\"\",\"Falta conteo\",IF(E${rowNumber}=0,\"Sin cambio\",\"Listo para cargar\"))))`,
      },
      null,
    ];
    row.height = 30;
    row.alignment = { vertical: "middle", wrapText: true };

    [1, 2, 3, 5, 7, 8, 12].forEach((column) => {
      row.getCell(column).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: GRAY },
      };
    });
    [4, 6, 9, 10, 11, 13].forEach((column) => {
      row.getCell(column).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: MINT },
      };
    });
  });

  const firstDataRow = 7;
  const lastDataRow = Math.max(firstDataRow, products.length + 6);
  sheet.dataValidations.add(`F${firstDataRow}:F${lastDataRow}`, {
    type: "list",
    allowBlank: true,
    formulae: [`\"${RECONCILIATION_CAUSES.join(",")}\"`],
  });
  sheet.dataValidations.add(`K${firstDataRow}:K${lastDataRow}`, {
    type: "list",
    allowBlank: true,
    formulae: ['"Revisado,Pendiente"'],
  });
  sheet.dataValidations.add(`M${firstDataRow}:M${lastDataRow}`, {
    type: "list",
    allowBlank: true,
    formulae: ['"Sí,No"'],
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
