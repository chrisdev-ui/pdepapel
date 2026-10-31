/**
 * El paquete real de un producto, ya empacado, en gramos y centímetros: con él
 * Mercado Libre cotiza el envío y lo recibe al publicar. Las cuatro medidas van
 * juntas; si falta una, el producto cuenta como «sin medir».
 */
export interface ProductPackage {
  weightGrams: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
}

export const PACKAGE_LIMITS = {
  weightGrams: { min: 1, max: 30_000 },
  sideCm: { min: 1, max: 150 },
} as const;

export function productPackageOf(product: {
  packageWeightGrams?: number | null;
  packageHeightCm?: number | null;
  packageWidthCm?: number | null;
  packageLengthCm?: number | null;
}): ProductPackage | null {
  const { packageWeightGrams: weightGrams, packageHeightCm: heightCm, packageWidthCm: widthCm, packageLengthCm: lengthCm } = product;
  if (weightGrams == null || heightCm == null || widthCm == null || lengthCm == null) return null;
  return { weightGrams, heightCm, widthCm, lengthCm };
}

export function packageProblem(value: ProductPackage): string | null {
  const { weightGrams, heightCm, widthCm, lengthCm } = value;
  if (!Number.isInteger(weightGrams) || weightGrams < PACKAGE_LIMITS.weightGrams.min || weightGrams > PACKAGE_LIMITS.weightGrams.max) {
    return `el peso debe ser un número entero de gramos entre ${PACKAGE_LIMITS.weightGrams.min} y ${PACKAGE_LIMITS.weightGrams.max}`;
  }
  for (const [label, side] of [["alto", heightCm], ["ancho", widthCm], ["largo", lengthCm]] as const) {
    if (!Number.isFinite(side) || side < PACKAGE_LIMITS.sideCm.min || side > PACKAGE_LIMITS.sideCm.max) {
      return `el ${label} debe estar entre ${PACKAGE_LIMITS.sideCm.min} y ${PACKAGE_LIMITS.sideCm.max} cm`;
    }
  }
  return null;
}

const number = (raw: string) => Number(raw.trim().replace(/\s*(g|gr|gramos|cm|kg)$/i, "").replace(",", "."));

/**
 * Filas «SKU, peso g, alto cm, ancho cm, largo cm» separadas por coma, punto y
 * coma o tabulador (lo que llega pegado de WhatsApp u hoja de cálculo). Ignora
 * líneas vacías, comentarios con # y una cabecera que empiece por «sku».
 */
export function parsePackageRows(text: string): { rows: (ProductPackage & { sku: string })[]; problems: string[] } {
  const rows: (ProductPackage & { sku: string })[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || /^sku\b/i.test(trimmed)) return;
    // Con tabulador o punto y coma, la coma queda libre para decimales («10,5»).
    const separator = /[\t;]/.test(trimmed) ? /[\t;]/ : /,/;
    const cells = trimmed.split(separator).map((cell) => cell.trim()).filter(Boolean);
    if (cells.length !== 5) {
      problems.push(`línea ${index + 1}: se esperaban 5 valores (SKU, peso g, alto, ancho, largo cm)`);
      return;
    }
    const [sku, weight, height, width, length] = cells;
    const value = { weightGrams: number(weight), heightCm: number(height), widthCm: number(width), lengthCm: number(length) };
    const problem = packageProblem(value);
    if (problem) {
      problems.push(`línea ${index + 1} (${sku}): ${problem}`);
      return;
    }
    if (seen.has(sku)) {
      problems.push(`línea ${index + 1}: ${sku} está repetido`);
      return;
    }
    seen.add(sku);
    rows.push({ sku, ...value });
  });
  return { rows, problems };
}
