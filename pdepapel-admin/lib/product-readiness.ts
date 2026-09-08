/**
 * “Listo para vender”: qué le falta a un producto para publicarse bien en la
 * tienda y en Google Merchant. Puro y testeable.
 */

export interface ReadinessInput {
  name?: string | null;
  price?: number | null;
  acqPrice?: number | null;
  categoryId?: string | null;
  images?: { url: string }[] | number;
  gtin?: string | null;
  hasNoProductIdentifier?: boolean | null;
  description?: string | null;
  isKit?: boolean | null;
}

export interface ReadinessCheck {
  id: "name" | "image" | "price" | "cost" | "category" | "identifier" | "description";
  label: string;
  ok: boolean;
  /** Etiqueta corta de lo que falta, para la lista. */
  missing: string;
  hint?: string;
}

export interface Readiness {
  checks: ReadinessCheck[];
  complete: boolean;
  done: number;
  total: number;
  missing: string[];
}

const EMOJI = new RegExp("\\p{Extended_Pictographic}", "u");
const stripHtml = (value: string) => value.replace(/<[^>]*>/g, "").trim();

export function getProductReadiness(product: ReadinessInput): Readiness {
  const imageCount = typeof product.images === "number" ? product.images : (product.images?.length ?? 0);
  const name = (product.name ?? "").trim();
  const description = product.description ? stripHtml(product.description) : "";
  const checks: ReadinessCheck[] = [
    { id: "name", label: "Nombre claro y sin emojis", ok: name.length >= 3 && !EMOJI.test(name), missing: "nombre" },
    { id: "image", label: imageCount > 0 ? `Al menos 1 imagen (tiene ${imageCount})` : "Al menos 1 imagen", ok: imageCount > 0, missing: "imagen" },
    { id: "price", label: "Precio de venta", ok: Number(product.price) > 0, missing: "precio" },
    { id: "cost", label: "Costo de compra (para el margen)", ok: Number(product.acqPrice) > 0, missing: "costo", hint: product.isKit ? "En un kit el costo sale de sus componentes" : undefined },
    { id: "category", label: "Subcategoría", ok: Boolean(product.categoryId), missing: "categoría" },
    { id: "identifier", label: "GTIN real o marcado “sin identificador”", ok: Boolean(product.gtin?.trim()) || product.hasNoProductIdentifier === true, missing: "identificador", hint: "Google Merchant lo exige; nunca inventes un GTIN" },
    { id: "description", label: "Descripción", ok: description.length >= 20, missing: "descripción" },
  ];
  if (product.isKit) {
    const cost = checks.find((c) => c.id === "cost")!;
    cost.ok = true;
    cost.label = "Costo: se calcula desde los componentes";
  }
  const done = checks.filter((c) => c.ok).length;
  return { checks, complete: done === checks.length, done, total: checks.length, missing: checks.filter((c) => !c.ok).map((c) => c.missing) };
}

/** Versión para la lista, donde no se carga la descripción. */
export function getListReadiness(product: Omit<ReadinessInput, "description">): Readiness {
  const readiness = getProductReadiness({ ...product, description: undefined });
  const checks = readiness.checks.filter((c) => c.id !== "description");
  const done = checks.filter((c) => c.ok).length;
  return { checks, complete: done === checks.length, done, total: checks.length, missing: checks.filter((c) => !c.ok).map((c) => c.missing) };
}

export type ProductShape = "individual" | "variante" | "kit";

export function getProductShape(product: { isKit?: boolean | null; productGroupId?: string | null }): { id: ProductShape; label: string } {
  if (product.isKit) return { id: "kit", label: "Kit" };
  if (product.productGroupId) return { id: "variante", label: "Variante" };
  return { id: "individual", label: "Individual" };
}

export type ProductView = "activos" | "sin-completar" | "stock-critico" | "agotados" | "archivados" | "todos";

export const PRODUCT_VIEWS: { id: ProductView; label: string }[] = [
  { id: "activos", label: "Activos" },
  { id: "sin-completar", label: "Sin completar" },
  { id: "stock-critico", label: "Stock crítico" },
  { id: "agotados", label: "Agotados" },
  { id: "archivados", label: "Archivados" },
  { id: "todos", label: "Todos" },
];

export function isProductView(value: string | null | undefined): value is ProductView {
  return PRODUCT_VIEWS.some((v) => v.id === value);
}

export function productMatchesView(
  product: { isArchived: boolean; stock: number } & Omit<ReadinessInput, "description">,
  view: ProductView,
  lowStockThreshold = 5,
): boolean {
  switch (view) {
    case "todos":
      return true;
    case "archivados":
      return product.isArchived;
    case "activos":
      return !product.isArchived;
    case "sin-completar":
      return !product.isArchived && !getListReadiness(product).complete;
    case "stock-critico":
      return !product.isArchived && product.stock > 0 && product.stock <= lowStockThreshold;
    case "agotados":
      return !product.isArchived && product.stock <= 0;
  }
}
