/**
 * Calculadora de dimensiones de paquete basada en tamaño de productos
 *
 * Estrategia: Determinar si usar bolsa o caja según cantidad y tipo de productos
 * Sistema de tamaños: Dimensión (XS, S, M, L, XL) + Peso (L=Liviano, P=Pesado)
 */

import { parseSizeValue } from "@/constants/sizes";

interface PackageDimensions {
  weight: number; // kg
  height: number; // cm
  width: number; // cm
  length: number; // cm
  type: "bag" | "box"; // Tipo de empaque
  size: "XS" | "S" | "M" | "L" | "XL"; // Tamaño del empaque
  id?: string;
  name?: string;
}

interface CartItem {
  productId: string;
  quantity: number;
  size?: {
    name: string;
    value: string;
  };
}

interface Product {
  id: string;
  name: string;
  size: {
    name: string;
    value: string;
  };
}

/**
 * Configuración de BOLSAS (bags)
 * Usadas para pocos productos (1-5) con máximo 1 producto pesado
 */
const BAG_CONFIGURATIONS: Record<
  "S" | "M" | "L",
  Omit<PackageDimensions, "weight">
> = {
  S: {
    width: 20,
    length: 28,
    height: 2,
    type: "bag",
    size: "S",
    name: "Bolsa Pequeña (S)",
    // Permite productos hasta tamaño S (XS, S)
  },
  M: {
    width: 29,
    length: 38,
    height: 4,
    type: "bag",
    size: "M",
    name: "Bolsa Mediana (M)",
    // Permite productos hasta tamaño M (XS, S, M)
  },
  L: {
    width: 34,
    length: 42,
    height: 6,
    type: "bag",
    size: "L",
    name: "Bolsa Grande (L)",
    // Permite productos hasta tamaño L (XS, S, M, L)
  },
};

/**
 * Configuración de CAJAS (boxes)
 * Usadas para muchos productos (6+) o más de 1 producto pesado
 */
const BOX_CONFIGURATIONS: Record<
  "XS" | "S" | "M" | "L",
  Omit<PackageDimensions, "weight">
> = {
  XS: {
    width: 26,
    length: 16,
    height: 8,
    type: "box",
    size: "XS",
    // Permite productos hasta tamaño XS (XS)
  },
  S: {
    width: 20,
    length: 21,
    height: 10,
    type: "box",
    size: "S",
    // Permite productos hasta tamaño S (XS, S)
  },
  M: {
    width: 33,
    length: 20,
    height: 10,
    type: "box",
    size: "M",
    // Permite productos hasta tamaño M (XS, S, M)
  },
  L: {
    width: 33,
    length: 26,
    height: 10,
    type: "box",
    size: "L",
    // Permite productos hasta tamaño L (XS, S, M, L)
  },
};

/**
 * Peso estimado por dimensión y peso del producto (en kg)
 * Ajustado para papelería ligera: casi siempre ≤1kg, máximo absoluto ~3kg
 */
const PRODUCT_WEIGHT_MAP: Record<string, Record<string, number>> = {
  XS: { L: 0.005, P: 0.02 }, // Muy pequeño (clips, minas, grapas)
  S: { L: 0.02, P: 0.08 }, // Pequeño (bolígrafos, gomas, marcadores)
  M: { L: 0.05, P: 0.15 }, // Mediano (cuadernos, folders, blocks)
  L: { L: 0.1, P: 0.3 }, // Grande (cajas grandes, carpetas pesadas)
  XL: { L: 0.2, P: 0.6 }, // Muy grande (resmas, paquetes múltiples)
};

/**
 * Orden de tamaños de menor a mayor
 */
const SIZE_ORDER = ["XS", "S", "M", "L", "XL"];

/**
 * Determina el índice de tamaño para comparaciones
 */
function getSizeIndex(dimension: string): number {
  const index = SIZE_ORDER.indexOf(dimension);
  return index === -1 ? 0 : index;
}

/**
 * Usa multiplicación/división por 100 para evitar errores de punto flotante
 */
function roundTo2Decimals(num: number): number {
  return Math.round(num * 100) / 100;
}

export interface BoxConfiguration extends Omit<PackageDimensions, "weight"> {
  type: "box";
  id?: string;
  name?: string;
}

/**
 * Calcula las dimensiones del paquete basado en los productos del carrito
 */
/**
 * Computes package dimensions based on cart items and products.
 * Accepts optional `boxConfigurations` to override hardcoded defaults.
 * If boxConfigurations is provided, it expects a map of type -> Box (DB model or similar structure).
 */
export function calculatePackageDimensions(
  cartItems: CartItem[],
  products: Product[],
  boxConfigurations?: Record<string, BoxConfiguration>, // Pass DB boxes here: { XS: boxObj, S: boxObj, ... }
): PackageDimensions {
  // If no items, use default logic (Bag M)
  if (cartItems.length === 0) {
    return {
      ...BAG_CONFIGURATIONS.M,
      weight: 1,
    };
  }

  // Create map for fast lookup
  const productMap = new Map(products.map((p) => [p.id, p]));

  let totalProducts = 0;
  let heavyProductsCount = 0; // count of products with weight "P"
  let largestDimension: "XS" | "S" | "M" | "L" | "XL" = "XS";
  let totalWeight = 0;

  for (const item of cartItems) {
    const product = productMap.get(item.productId);
    if (!product) continue;

    let parsed = parseSizeValue(product.size.value);
    if (!parsed) {
      console.warn(
        `Tamaño inválido para producto ${product.id}: ${product.size.value}. Usando tamaño por defecto M-L`,
      );
      parsed = { dimension: "M", weight: "L" };
    }

    const { dimension, weight } = parsed;

    totalProducts += item.quantity;

    if (weight === "P") {
      heavyProductsCount += item.quantity;
    }

    if (getSizeIndex(dimension) > getSizeIndex(largestDimension)) {
      largestDimension = dimension as "XS" | "S" | "M" | "L" | "XL";
    }

    const productWeight =
      PRODUCT_WEIGHT_MAP[dimension]?.[weight] || PRODUCT_WEIGHT_MAP.M.L;
    totalWeight += productWeight * item.quantity;
  }

  // RULE: Determine if we use a BAG or a BOX
  const useBag =
    totalProducts >= 1 &&
    totalProducts <= 5 &&
    heavyProductsCount <= 1 &&
    ["XS", "S", "M", "L"].includes(largestDimension);

  let packageDimensions: Omit<PackageDimensions, "weight">;

  if (useBag) {
    // BAG SELECTION
    if (largestDimension === "XS" || largestDimension === "S") {
      packageDimensions = BAG_CONFIGURATIONS.S;
    } else if (largestDimension === "M") {
      packageDimensions = BAG_CONFIGURATIONS.M;
    } else {
      packageDimensions = BAG_CONFIGURATIONS.L;
    }
  } else {
    // BOX SELECTION
    // If we have dynamic box configurations, use them
    const boxConfig =
      boxConfigurations ||
      (BOX_CONFIGURATIONS as unknown as Record<string, BoxConfiguration>);

    // Fallback logic if specific size missing in dynamic config, try to fall back to hardcoded
    const getBox = (size: string): BoxConfiguration => {
      const config = boxConfig[size];
      return (
        config ||
        (BOX_CONFIGURATIONS as unknown as Record<string, BoxConfiguration>)[
          size
        ]
      );
    };

    if (largestDimension === "XS") {
      packageDimensions = getBox("XS");
    } else if (largestDimension === "S") {
      packageDimensions = getBox("S");
    } else if (largestDimension === "M") {
      packageDimensions = getBox("M");
    } else {
      // L or XL -> use L box
      packageDimensions = getBox("L");
    }
  }

  // Minimum weight 1.0kg (EnvioClick requirement), add packaging weight
  const packagingWeight = useBag ? 0.05 : 0.2; // Bag 50g, Box 200g

  const calculatedWeight = totalWeight + packagingWeight;
  const finalWeight = roundTo2Decimals(Math.max(calculatedWeight, 1.0));

  return {
    ...packageDimensions,
    // Ensure all required fields are present (some DB boxes might have extra fields, need to map correctly if types mismatch)
    height: Number(packageDimensions.height),
    width: Number(packageDimensions.width),
    length: Number(packageDimensions.length),
    type: packageDimensions.type as "bag" | "box",
    size: packageDimensions.size as "XS" | "S" | "M" | "L" | "XL",
    weight: finalWeight,
  };
}

/**
 * Obtiene dimensiones por defecto para casos donde no hay info de producto
 */
export function getDefaultPackageDimensions(): PackageDimensions {
  return {
    ...BAG_CONFIGURATIONS.M,
    weight: 1.0, // EnvioClick minimum: 1.0kg
  };
}

/**
 * Obtiene todas las configuraciones de bolsas
 */
export function getBagConfigurations() {
  return { ...BAG_CONFIGURATIONS };
}

/**
 * Obtiene todas las configuraciones de cajas
 */
export function getBoxConfigurations() {
  return { ...BOX_CONFIGURATIONS };
}

/**
 * Obtiene el mapa de pesos de productos
 */
export function getProductWeightMap() {
  return { ...PRODUCT_WEIGHT_MAP };
}
