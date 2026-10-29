import { landedCost, marginOnPrice, priceToReachMargin } from "./price-calculator";

export interface MarginProduct {
  id: string;
  name: string;
  categoryName: string | null;
  price: number;
  acqPrice: number | null;
  transportationCost: number | null;
  isKit: boolean;
  /** «Precio bajo a propósito» en la ficha: no entra en el análisis. */
  marginExceptionReason?: string | null;
}

export interface BelowMarginProduct {
  id: string;
  nombre: string;
  precio: number;
  costo: number;
  margenPct: number;
  precioNecesario: number;
  subida: number;
}

export interface BelowMarginCategory {
  categoria: string;
  debajo: number;
  /** Productos de la categoría que se pudieron evaluar (con costo, sin kits). */
  evaluados: number;
  subidaPromedio: number;
  productos: BelowMarginProduct[];
}

export interface BelowMarginThreshold {
  margenPct: number;
  debajo: number;
  categorias: BelowMarginCategory[];
}

const NO_CATEGORY = "Sin categoría";

/**
 * Productos activos cuyo margen sobre el precio (con costo + envío por unidad)
 * queda por debajo de cada umbral, por categoría, con el precio al peso que
 * tendrían que tener para llegar. Los kits no entran (su costo es el de sus
 * piezas), tampoco los que tienen excepción de margen (precio bajo a
 * propósito), y los productos sin costo de compra se cuentan aparte.
 */
export function analyzeBelowMargin(products: readonly MarginProduct[], thresholds: readonly number[]) {
  const evaluated: { product: MarginProduct; cost: number; margin: number }[] = [];
  let kits = 0;
  let withoutCost = 0;
  let withException = 0;
  for (const product of products) {
    if (product.isKit) {
      kits += 1;
      continue;
    }
    if (product.marginExceptionReason?.trim()) {
      withException += 1;
      continue;
    }
    const cost = landedCost(product.acqPrice, product.transportationCost);
    const margin = cost === null ? null : marginOnPrice(product.price, cost);
    if (cost === null || margin === null) {
      withoutCost += 1;
      continue;
    }
    evaluated.push({ product, cost, margin });
  }
  const perCategory = new Map<string, number>();
  for (const { product } of evaluated) perCategory.set(product.categoryName ?? NO_CATEGORY, (perCategory.get(product.categoryName ?? NO_CATEGORY) ?? 0) + 1);

  const porUmbral: BelowMarginThreshold[] = Array.from(new Set(thresholds))
    .sort((a, b) => a - b)
    .map((threshold) => {
      const groups = new Map<string, BelowMarginProduct[]>();
      for (const { product, cost, margin } of evaluated) {
        if (margin >= threshold) continue;
        const needed = priceToReachMargin(cost, threshold);
        if (needed === null) continue;
        const name = product.categoryName ?? NO_CATEGORY;
        groups.set(name, [
          ...(groups.get(name) ?? []),
          { id: product.id, nombre: product.name, precio: product.price, costo: Math.round(cost), margenPct: margin, precioNecesario: needed, subida: needed - product.price },
        ]);
      }
      const categorias = Array.from(groups.entries())
        .map(([categoria, items]) => ({
          categoria,
          debajo: items.length,
          evaluados: perCategory.get(categoria) ?? items.length,
          subidaPromedio: Math.round(items.reduce((sum, item) => sum + item.subida, 0) / items.length),
          productos: [...items].sort((a, b) => b.subida - a.subida || a.nombre.localeCompare(b.nombre, "es")),
        }))
        .sort((a, b) => b.debajo - a.debajo || a.categoria.localeCompare(b.categoria, "es"));
      return { margenPct: threshold, debajo: categorias.reduce((sum, category) => sum + category.debajo, 0), categorias };
    });

  return { evaluados: evaluated.length, sinCosto: withoutCost, kits, conExcepcion: withException, porUmbral };
}
