export const LABEL_PRINT_FORMATS = {
  COMPACT_65: {
    id: "COMPACT_65",
    name: "Ahorro · 65 por hoja A4",
    description: "38,1 × 21,2 mm · QR de 18 mm",
    itemsPerPage: 65,
    widthMm: 38.1,
    heightMm: 21.2,
    qrSizeMm: 18,
  },
  STANDARD_40: {
    id: "STANDARD_40",
    name: "Estándar · 40 por hoja A4",
    description: "48 × 28 mm · QR de 22 mm",
    itemsPerPage: 40,
    widthMm: 48,
    heightMm: 28,
    qrSizeMm: 22,
  },
} as const;

export type LabelPrintFormat = keyof typeof LABEL_PRINT_FORMATS;

export function getLabelPrintFormat(format: LabelPrintFormat) {
  return LABEL_PRINT_FORMATS[format];
}
