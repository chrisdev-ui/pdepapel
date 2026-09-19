import { productLine, type SellLine } from "@/lib/sell-cart";

/**
 * Búsqueda para vender (Vender, punto de venta): una sola entrada por la que
 * pasan lo escrito, lo pegado, el lector de mano y las cámaras. Los resultados
 * se ordenan para el mostrador: el código exacto primero, luego lo que tiene
 * unidades por nombre (los más vendidos antes), y lo agotado al final.
 */

export interface SaleCandidate {
  id: string;
  name: string;
  sku: string;
  gtin?: string | null;
  stock: number;
  price: number;
  /** Precio con la oferta vigente; igual a `price` sin oferta. */
  offerPrice?: number | null;
  offerLabel?: string | null;
  isKit?: boolean;
  soldCount?: number | null;
  color?: { name: string } | null;
  size?: { name: string } | null;
  design?: { name: string } | null;
  category?: { name: string } | null;
  productGroupId?: string | null;
  images?: { url: string }[];
  /** Componentes del kit, para decir qué descuenta. */
  kitComponents?: { quantity: number; component: { name: string } }[];
}

export type SaleMatch = "codigo" | "nombre" | "contiene";

export interface RankedSaleCandidate {
  candidate: SaleCandidate;
  match: SaleMatch;
  available: boolean;
}

const fold = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** `true` cuando el código escrito o leído es exactamente el SKU o el GTIN del producto. */
export function isExactCode(candidate: Pick<SaleCandidate, "sku" | "gtin">, code: string): boolean {
  const wanted = fold(code);
  if (!wanted) return false;
  return fold(candidate.sku) === wanted || (Boolean(candidate.gtin) && fold(candidate.gtin) === wanted);
}

export function classifySaleMatch(candidate: SaleCandidate, query: string): SaleMatch {
  const wanted = fold(query);
  if (!wanted) return "contiene";
  if (isExactCode(candidate, query)) return "codigo";
  if (fold(candidate.name).startsWith(wanted)) return "nombre";
  return "contiene";
}

/**
 * Ordena para vender. Con texto: código exacto, nombre que empieza igual,
 * nombre que contiene; dentro de cada grupo primero con unidades y más
 * vendidos. Sin texto: los que tienen unidades, más vendidos primero.
 */
export function rankSaleCandidates(candidates: readonly SaleCandidate[], query: string): RankedSaleCandidate[] {
  const order: Record<SaleMatch, number> = { codigo: 0, nombre: 1, contiene: 2 };
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      if (seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return true;
    })
    .map((candidate) => ({ candidate, match: classifySaleMatch(candidate, query), available: candidate.stock > 0 }))
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      if (order[a.match] !== order[b.match]) return order[a.match] - order[b.match];
      const sold = (b.candidate.soldCount ?? 0) - (a.candidate.soldCount ?? 0);
      if (sold !== 0) return sold;
      return a.candidate.name.localeCompare(b.candidate.name, "es");
    });
}

/** El único resultado que se agrega solo al pulsar Enter o al leer un código: el código exacto. */
export function findExactSaleCandidate(candidates: readonly SaleCandidate[], code: string): SaleCandidate | null {
  return candidates.find((candidate) => isExactCode(candidate, code)) ?? null;
}

/** Chips de variante: color y tamaño, y el diseño solo si el nombre no lo lleva. */
const PLACEHOLDER_VALUE = /^(único|unica|única|unico|n\/a|na|-)$/i;

export function saleCandidateChips(candidate: SaleCandidate): string[] {
  const chips = [candidate.color?.name, candidate.size?.name]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value) && !PLACEHOLDER_VALUE.test(value as string));
  const design = candidate.design?.name;
  if (design && !fold(candidate.name).includes(fold(design))) chips.push(design);
  if (candidate.isKit) chips.push("Kit");
  return chips;
}

/** «Descuenta 2 × Washi tape y 1 × Folder» para un kit; vacío para un producto normal. */
export function describeKitDeduction(candidate: SaleCandidate): string | null {
  const parts = (candidate.kitComponents ?? []).map((row) => `${row.quantity} × ${row.component.name}`);
  if (parts.length === 0) return null;
  return `Descuenta ${parts.join(", ")}`;
}

/** Línea del carrito con precio de oferta, chips y nota de kit. */
export function saleCandidateToLine(candidate: SaleCandidate): SellLine {
  const unit = candidate.offerPrice != null && candidate.offerPrice < candidate.price ? candidate.offerPrice : candidate.price;
  return productLine({
    productId: candidate.id,
    name: candidate.name,
    detail: `SKU ${candidate.sku} · ${candidate.stock} ${candidate.isKit ? (candidate.stock === 1 ? "kit" : "kits") : "und"}`,
    price: unit,
    originalPrice: unit < candidate.price ? candidate.price : null,
    offerLabel: unit < candidate.price ? (candidate.offerLabel ?? "Oferta") : null,
    chips: saleCandidateChips(candidate),
    note: describeKitDeduction(candidate),
    maxQuantity: candidate.stock,
    imageUrl: candidate.images?.[0]?.url ?? null,
  });
}
