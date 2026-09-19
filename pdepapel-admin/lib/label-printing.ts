/**
 * Plantillas de hojas de etiquetas y la geometría que comparten la vista
 * previa del panel, la página de impresión y la hoja de calibración.
 *
 * Todo se declara en milímetros sobre la hoja física. La única hoja hoy es la
 * AH Royal de 65 etiquetas en tamaño carta (215,9 × 279,4 mm); el fabricante
 * no publica la ficha con márgenes y paso, así que la geometría es
 * PROVISIONAL: sale de la única disposición posible de 5 × 13 etiquetas de
 * 38,1 × 21,2 mm en una hoja carta y se afina con la hoja de calibración
 * impresa sobre la hoja real.
 */

export const LABEL_SHEET_TEMPLATES = {
  AH_ROYAL_65_CARTA: {
    id: "AH_ROYAL_65_CARTA",
    name: "AH Royal · 65 por hoja carta",
    reference: "AH Royal, hoja carta (US Letter) de 65 etiquetas",
    description: "38,1 × 21,2 mm · 5 columnas × 13 filas · QR de 17 mm",
    /** `letter` es lo que entiende `@page { size }`; los mm son la hoja real. */
    page: { widthMm: 215.9, heightMm: 279.4, cssSize: "letter" as const },
    columns: 5,
    rows: 13,
    labelWidthMm: 38.1,
    labelHeightMm: 21.2,
    /** Distancia del borde de la hoja a la primera etiqueta. */
    marginTopMm: 1.9,
    marginLeftMm: 7.7,
    /** Distancia entre el inicio de una etiqueta y el de la siguiente. */
    pitchXMm: 40.6,
    pitchYMm: 21.2,
    /** Dentro de la etiqueta: aire al borde, QR y separación QR–texto. */
    paddingMm: 1,
    qrSizeMm: 17,
    gapMm: 1,
    /** Sin ficha publicada por el fabricante: confirmar con la calibración. */
    provisional: true,
  },
} as const;

export type LabelSheetTemplateId = keyof typeof LABEL_SHEET_TEMPLATES;
export type LabelSheetTemplate = (typeof LABEL_SHEET_TEMPLATES)[LabelSheetTemplateId];

export const DEFAULT_LABEL_SHEET: LabelSheetTemplateId = "AH_ROYAL_65_CARTA";

export function getLabelSheetTemplate(id: LabelSheetTemplateId = DEFAULT_LABEL_SHEET) {
  return LABEL_SHEET_TEMPLATES[id];
}

export function labelsPerSheet(template: LabelSheetTemplate) {
  return template.columns * template.rows;
}

/** Cuánto mide en pantalla un milímetro (CSS: 96 px por pulgada). */
export const PX_PER_MM = 96 / 25.4;

export interface LabelBox {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

/**
 * Dónde cae cada cosa dentro de una etiqueta. Es la misma cuenta que hace el
 * CSS de la hoja: si aquí el texto empieza después del QR y nada se sale de la
 * etiqueta, en papel tampoco (el solape del panel venía de un QR fijo en
 * píxeles que no obedecía a esta cuenta).
 */
export function labelGeometry(template: LabelSheetTemplate): {
  label: LabelBox;
  qr: LabelBox;
  text: LabelBox;
} {
  const { labelWidthMm, labelHeightMm, paddingMm, qrSizeMm, gapMm } = template;
  const qrSize = Math.min(qrSizeMm, labelHeightMm - paddingMm * 2);
  const qr = {
    xMm: paddingMm,
    yMm: (labelHeightMm - qrSize) / 2,
    widthMm: qrSize,
    heightMm: qrSize,
  };
  const textX = qr.xMm + qr.widthMm + gapMm;
  const text = {
    xMm: textX,
    yMm: paddingMm,
    widthMm: labelWidthMm - textX - paddingMm,
    heightMm: labelHeightMm - paddingMm * 2,
  };
  return { label: { xMm: 0, yMm: 0, widthMm: labelWidthMm, heightMm: labelHeightMm }, qr, text };
}

/** Comprueba que la hoja cabe en el papel: lo que se sale se imprime cortado. */
export function sheetFitsPage(template: LabelSheetTemplate) {
  const right = template.marginLeftMm + (template.columns - 1) * template.pitchXMm + template.labelWidthMm;
  const bottom = template.marginTopMm + (template.rows - 1) * template.pitchYMm + template.labelHeightMm;
  return {
    fits: right <= template.page.widthMm + 0.01 && bottom <= template.page.heightMm + 0.01,
    rightMm: Math.round(right * 100) / 100,
    bottomMm: Math.round(bottom * 100) / 100,
  };
}

export interface PaginatedLabels<T> {
  /** Cada página trae una entrada por posición; `null` es una posición vacía. */
  pages: (T | null)[][];
  pageCount: number;
  perPage: number;
  /** Posiciones saltadas en la primera hoja (etiquetas ya usadas). */
  skipped: number;
  /** Posiciones libres que quedan en la última hoja. */
  freeOnLastPage: number;
}

/**
 * Reparte las etiquetas en hojas. `startAt` (1…N) deja libres las primeras
 * posiciones de la primera hoja, para aprovechar una hoja a medio usar.
 */
export function paginateLabels<T>(
  labels: T[],
  template: LabelSheetTemplate,
  startAt = 1,
): PaginatedLabels<T> {
  const perPage = labelsPerSheet(template);
  const skipped = Math.min(Math.max(Math.floor(startAt) - 1, 0), perPage - 1);
  if (labels.length === 0) {
    return { pages: [], pageCount: 0, perPage, skipped, freeOnLastPage: 0 };
  }
  const slots: (T | null)[] = [...Array<null>(skipped).fill(null), ...labels];
  const pages: (T | null)[][] = [];
  for (let index = 0; index < slots.length; index += perPage) {
    const page = slots.slice(index, index + perPage);
    while (page.length < perPage) page.push(null);
    pages.push(page);
  }
  const used = skipped + labels.length;
  const freeOnLastPage = pages.length * perPage - used;
  return { pages, pageCount: pages.length, perPage, skipped, freeOnLastPage };
}

export interface LabelSheetOptions {
  /** Contorno fino y marcas de esquina para recortar con tijeras. */
  cutGuides: boolean;
  /** Desplaza toda la impresión, en mm, para corregir el arrastre de la impresora. */
  offsetXMm: number;
  offsetYMm: number;
}

export const DEFAULT_SHEET_OPTIONS: LabelSheetOptions = {
  cutGuides: true,
  offsetXMm: 0,
  offsetYMm: 0,
};

const mm = (value: number) => `${Math.round(value * 1000) / 1000}mm`;

/**
 * CSS de la hoja: la misma hoja de estilos para la vista previa (escalada) y
 * para la página de impresión, así lo que se ve es lo que sale. Las
 * posiciones son absolutas en mm desde la esquina de la hoja (una regla por
 * `data-slot`), no una cuadrícula con huecos: así el paso entre etiquetas no
 * depende del ancho del contenido ni de los márgenes que ponga el navegador.
 */
export function labelSheetCss(
  template: LabelSheetTemplate,
  options: LabelSheetOptions = DEFAULT_SHEET_OPTIONS,
) {
  const geometry = labelGeometry(template);
  const perPage = labelsPerSheet(template);
  const positions: string[] = [];
  for (let index = 0; index < perPage; index += 1) {
    const column = index % template.columns;
    const row = Math.floor(index / template.columns);
    const left = template.marginLeftMm + column * template.pitchXMm + options.offsetXMm;
    const top = template.marginTopMm + row * template.pitchYMm + options.offsetYMm;
    // Por índice explícito, no por `nth-child`: la hoja de calibración mete
    // reglas antes de las posiciones y el orden en el DOM no debe importar.
    positions.push(
      `.label-sheet__slot[data-slot="${index + 1}"]{left:${mm(left)};top:${mm(top)}}`,
    );
  }
  const guides = options.cutGuides
    ? `.label-sheet__slot{outline:0.15mm solid #b4bcc9;outline-offset:-0.15mm}
.label-sheet__slot::before,.label-sheet__slot::after{content:"";position:absolute;width:1.5mm;height:1.5mm;border-color:#64748b;border-style:solid;pointer-events:none}
.label-sheet__slot::before{top:-0.2mm;left:-0.2mm;border-width:0.2mm 0 0 0.2mm}
.label-sheet__slot::after{bottom:-0.2mm;right:-0.2mm;border-width:0 0.2mm 0.2mm 0}`
    : "";
  return `
@page{size:${template.page.cssSize};margin:0}
.label-sheet{width:${mm(template.page.widthMm)};height:${mm(template.page.heightMm)};position:relative;background:#fff;color:#0f172a;overflow:hidden;box-sizing:border-box;break-after:page;page-break-after:always}
.label-sheet:last-child{break-after:auto;page-break-after:auto}
.label-sheet__slot{position:absolute;width:${mm(template.labelWidthMm)};height:${mm(template.labelHeightMm)};box-sizing:border-box;overflow:hidden}
${positions.join("\n")}
${guides}
.label-sheet__qr{position:absolute;left:${mm(geometry.qr.xMm)};top:${mm(geometry.qr.yMm)};width:${mm(geometry.qr.widthMm)};height:${mm(geometry.qr.heightMm)};background:#fff}
.label-sheet__qr svg{display:block;width:100%;height:100%}
.label-sheet__text{position:absolute;left:${mm(geometry.text.xMm)};top:${mm(geometry.text.yMm)};width:${mm(geometry.text.widthMm)};height:${mm(geometry.text.heightMm)};display:flex;flex-direction:column;justify-content:center;gap:0.4mm;overflow:hidden;line-height:1.15}
.label-sheet__title{margin:0;font-size:7pt;font-weight:700;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.label-sheet__variant{margin:0;font-size:6pt;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.label-sheet__sku{margin:0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:5.5pt;color:#475569;white-space:nowrap;overflow:visible;letter-spacing:-0.01em}
.label-sheet__sku--long{font-size:4.8pt}
.label-sheet__price{margin:0;font-size:6.5pt;font-weight:800;white-space:nowrap}
`;
}

/** Ancho máximo del SKU sin cortarlo: por encima baja de tamaño, nunca «…». */
export const SKU_LONG_THRESHOLD = 20;
