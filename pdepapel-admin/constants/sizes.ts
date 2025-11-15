export interface DimensionOption {
  value: string;
  name: string;
}

export interface WeightOption {
  value: string;
  name: string;
}

/**
 * Dimensiones disponibles
 */
export const DIMENSIONS: DimensionOption[] = [
  { value: "XS", name: "Muy Pequeño" },
  { value: "S", name: "Pequeño" },
  { value: "M", name: "Mediano" },
  { value: "L", name: "Grande" },
  { value: "XL", name: "Muy Grande" },
];

/**
 * Pesos disponibles
 */
export const WEIGHTS: WeightOption[] = [
  { value: "L", name: "Liviano" },
  { value: "P", name: "Pesado" },
];

/**
 * Genera el nombre completo del tamaño a partir de dimensión y peso
 * Ejemplo: ("XS", "L") => "Muy pequeño liviano"
 */
export function generateSizeName(
  dimensionValue: string,
  weightValue: string,
): string {
  const dimension = DIMENSIONS.find((d) => d.value === dimensionValue);
  const weight = WEIGHTS.find((w) => w.value === weightValue);

  if (!dimension || !weight) {
    throw new Error(
      `Dimensión o peso inválido: ${dimensionValue}-${weightValue}`,
    );
  }

  return `${dimension.name} ${weight.name.toLowerCase()}`;
}

/**
 * Genera el valor del tamaño a partir de dimensión y peso
 * Ejemplo: ("XS", "L") => "XS-L"
 */
export function generateSizeValue(
  dimensionValue: string,
  weightValue: string,
): string {
  return `${dimensionValue}-${weightValue}`;
}

/**
 * Parsea un valor de tamaño para extraer dimensión y peso
 * Ejemplo: "XS-L" => { dimension: "XS", weight: "L" }
 */
export function parseSizeValue(value: string): {
  dimension: string;
  weight: string;
} | null {
  const parts = value.split("-");
  if (parts.length !== 2) {
    return null;
  }

  const [dimension, weight] = parts;

  // Validar que existan en las opciones
  const dimensionExists = DIMENSIONS.some((d) => d.value === dimension);
  const weightExists = WEIGHTS.some((w) => w.value === weight);

  if (!dimensionExists || !weightExists) {
    return null;
  }

  return { dimension, weight };
}

/**
 * Genera todas las combinaciones posibles de tamaños
 * Útil para crear tamaños en batch
 */
export function generateAllSizeCombinations(): Array<{
  name: string;
  value: string;
  dimension: string;
  weight: string;
}> {
  const combinations: Array<{
    name: string;
    value: string;
    dimension: string;
    weight: string;
  }> = [];

  for (const dimension of DIMENSIONS) {
    for (const weight of WEIGHTS) {
      combinations.push({
        name: generateSizeName(dimension.value, weight.value),
        value: generateSizeValue(dimension.value, weight.value),
        dimension: dimension.value,
        weight: weight.value,
      });
    }
  }

  return combinations;
}
