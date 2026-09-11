import { z } from "zod";

/**
 * Cajas de empaque (`Box`): reglas compartidas por la API, el formulario del
 * panel y la vista previa 3D. No toca la base de datos.
 */

/** Tipos de caja que entiende el cotizador (`lib/package-calculator.ts`). */
export const BOX_TYPES = ["XS", "S", "M", "L", "XL"] as const;
export type BoxType = (typeof BOX_TYPES)[number];

/** Límites por lado que aceptan las transportadoras (`lib/shipping-helpers.ts`). */
export const BOX_DIMENSION_MIN_CM = 1;
export const BOX_DIMENSION_MAX_CM = 300;
/** Decimales admitidos por lado. */
export const BOX_DIMENSION_DECIMALS = 1;

export const BOX_NAME_MAX_LENGTH = 60;

/**
 * Divisor del peso volumétrico (cm³ → kg). Es el factor habitual de
 * EnvioClick; el cotizador no lo calcula en el código (la transportadora lo
 * aplica al cotizar), así que el panel lo muestra solo como referencia.
 */
export const VOLUMETRIC_WEIGHT_DIVISOR = 5000;

const DECIMAL_SEPARATORS = /,/g;

/**
 * Convierte lo que escribe una persona ("12,5", "12.5", " 20 ") o lo que
 * manda un cliente (12.5) en un número. Devuelve `undefined` cuando está
 * vacío o no es un número finito; nunca lanza.
 */
export function parseMeasurement(input: unknown): number | undefined {
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : undefined;
  }
  if (typeof input !== "string") return undefined;
  const normalized = input.trim().replace(DECIMAL_SEPARATORS, ".");
  if (normalized === "" || !/^\d*\.?\d*$/.test(normalized)) return undefined;
  if (normalized === ".") return undefined;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

function hasAtMostDecimals(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.abs(value * factor - Math.round(value * factor)) < 1e-6;
}

/** Medida válida para una caja: número finito entre 1 y 300 cm con hasta un decimal. */
export function isValidBoxDimension(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= BOX_DIMENSION_MIN_CM &&
    value <= BOX_DIMENSION_MAX_CM &&
    hasAtMostDecimals(value, BOX_DIMENSION_DECIMALS)
  );
}

export const BOX_MESSAGES = {
  dimensionRequired: "Ingresa la medida en centímetros",
  dimensionInvalid: "Ingresa un número válido",
  dimensionMin: `La medida mínima es ${BOX_DIMENSION_MIN_CM} cm`,
  dimensionMax: `La medida máxima es ${BOX_DIMENSION_MAX_CM} cm`,
  dimensionDecimals: "Usa hasta un decimal",
  nameRequired: "Escribe un nombre para la caja",
  nameMax: `El nombre puede tener hasta ${BOX_NAME_MAX_LENGTH} caracteres`,
  typeInvalid: `Elige un tipo: ${BOX_TYPES.join(", ")}`,
} as const;

/** Medida ya numérica (lo que emite `MeasurementInput` en el formulario). */
export const boxDimensionSchema = z
  .number({
    required_error: BOX_MESSAGES.dimensionRequired,
    invalid_type_error: BOX_MESSAGES.dimensionInvalid,
  })
  .min(BOX_DIMENSION_MIN_CM, BOX_MESSAGES.dimensionMin)
  .max(BOX_DIMENSION_MAX_CM, BOX_MESSAGES.dimensionMax)
  .refine(
    (value) => hasAtMostDecimals(value, BOX_DIMENSION_DECIMALS),
    BOX_MESSAGES.dimensionDecimals,
  );

/** Medida tal como llega por la API: número o texto con coma o punto. */
export const boxDimensionInputSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  // Vacío → "requerido"; texto no numérico → "número inválido".
  if (value.trim() === "") return undefined;
  return parseMeasurement(value) ?? value;
}, boxDimensionSchema);

export const boxNameSchema = z
  .string({ required_error: BOX_MESSAGES.nameRequired })
  .trim()
  .min(1, BOX_MESSAGES.nameRequired)
  .max(BOX_NAME_MAX_LENGTH, BOX_MESSAGES.nameMax);

export const boxTypeSchema = z.enum(BOX_TYPES, {
  errorMap: () => ({ message: BOX_MESSAGES.typeInvalid }),
});

/** `true`, `"true"` y `1` marcan la caja como predeterminada; todo lo demás no. */
export const boxIsDefaultSchema = z.preprocess(
  (value) => value === true || value === "true" || value === 1,
  z.boolean(),
);

/** Esquema del formulario del panel (las medidas ya son números). */
export const boxFormSchema = z.object({
  name: boxNameSchema,
  type: boxTypeSchema,
  width: boxDimensionSchema,
  height: boxDimensionSchema,
  length: boxDimensionSchema,
  isDefault: z.boolean().default(false),
});

/** Esquema de la API (POST y PATCH): tolera texto con coma y booleanos en texto. */
export const boxInputSchema = z.object({
  name: boxNameSchema,
  type: boxTypeSchema,
  width: boxDimensionInputSchema,
  height: boxDimensionInputSchema,
  length: boxDimensionInputSchema,
  isDefault: boxIsDefaultSchema,
});

export type BoxFormValues = z.infer<typeof boxFormSchema>;
export type BoxInput = z.infer<typeof boxInputSchema>;

/** Mensaje del 409 (y del panel) al intentar borrar una caja que ya usan envíos. */
export function boxInUseMessage(shipmentsCount: number) {
  const plural = shipmentsCount === 1 ? "envío la usa" : "envíos la usan";
  return `No se puede eliminar esta caja: ${shipmentsCount} ${plural}. Si ya no quieres que el cotizador la elija, desactívala como predeterminada o elige otra caja de este tipo.`;
}

/** "usada en 3 envíos" / "sin envíos todavía" — para encabezados y filas. */
export function describeBoxUsage(shipmentsCount: number) {
  if (shipmentsCount === 0) return "sin envíos todavía";
  return `usada en ${shipmentsCount} ${shipmentsCount === 1 ? "envío" : "envíos"}`;
}

/** Nombre normalizado para comparar unicidad por tienda sin distinguir mayúsculas. */
export function normalizeBoxName(name: string) {
  return name.trim().toLocaleLowerCase("es-CO");
}

const cmFormatter = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: BOX_DIMENSION_DECIMALS,
});

const twoDecimalsFormatter = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** "12,5" — medida en centímetros con formato es-CO (sin la unidad). */
export function formatCm(value: number) {
  return cmFormatter.format(value);
}

/** "12,5 × 20 × 30 cm" */
export function formatBoxDimensions(width: number, height: number, length: number) {
  return `${formatCm(width)} × ${formatCm(height)} × ${formatCm(length)} cm`;
}

/** Volumen en litros (1 L = 1000 cm³). */
export function boxVolumeLiters(width: number, height: number, length: number) {
  return (width * height * length) / 1000;
}

/** Peso volumétrico en kg con el divisor de referencia. */
export function boxVolumetricWeightKg(width: number, height: number, length: number) {
  return (width * height * length) / VOLUMETRIC_WEIGHT_DIVISOR;
}

export function formatLiters(value: number) {
  return `${twoDecimalsFormatter.format(value)} L`;
}

export function formatKg(value: number) {
  return `${twoDecimalsFormatter.format(value)} kg`;
}
