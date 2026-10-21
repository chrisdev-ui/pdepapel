import { evaluatePoolMargins, maxPackFor, type CapsulePackCosts, type PackCheck } from "@/lib/pricing/capsules";

/**
 * Ediciones de cápsulas sugeridas a partir del inventario quieto. Puro, sin
 * base de datos ni IA: temas que salen de los datos (diseño, color, tipo,
 * subcategoría, marca), una banda de costo por edición, una bolsa con reglas
 * fijas y el margen de cada pack con el mismo motor del taller
 * (`evaluatePoolMargins`) contra el piso de la tienda o de la edición. Solo
 * sugiere: crear, imprimir y vender siguen siendo clics de Paula.
 */

export const SCORING_VERSION = "capsulas-v1";

/** Reglas de la bolsa (decisiones de Christian, 2026-10-21). Los pesos de costo viven en la tienda, no aquí. */
export const SUGGESTION_RULES = {
  /** El papel más caro de una edición cuesta como mucho 1,7 veces el más barato. */
  maxBandRatio: 1.7,
  /** Un producto no pasa del 20 % de los papeles de la bolsa. */
  maxProductShare: 0.2,
  minSlips: 40,
  maxSlips: 150,
  minProducts: 8,
  /** Un valor que cubre más del 40 % de los productos quietos es demasiado general para ser tema. */
  genericThemeShare: 0.4,
  maxSuggestions: 6,
  /** Sorteos de la búsqueda; las que quedan se confirman con los del taller. */
  searchRuns: 1000,
  confirmRuns: 5000,
} as const;

export type ThemeKind = "design" | "color" | "type" | "category" | "brand";

export interface SuggestionProduct {
  id: string;
  name: string;
  /** Costo de compra: el mismo que congela un papel al imprimirse. */
  unitCost: number;
  available: number;
  daysSinceLastSale: number | null;
  daysInStock: number;
  attributes: Partial<Record<ThemeKind, { id: string; name: string }>>;
  categoryName: string | null;
  onMercadoLibre: boolean;
  /** Parece de personaje o licencia y Paula no lo ha permitido: no entra en ninguna sugerencia. */
  licenseBlocked: boolean;
}

/** Los ✗ de Paula: temas que no quiere ver y productos que no van en un tema (`tema|producto`). */
export interface Rejections {
  themes: ReadonlySet<string>;
  pairs: ReadonlySet<string>;
}

export const NO_REJECTIONS: Rejections = { themes: new Set(), pairs: new Set() };
export const rejectionPair = (key: string, productId: string) => `${key}|${productId}`;

export interface Theme {
  key: string;
  kind: ThemeKind;
  label: string;
}

export interface BagLine {
  productId: string;
  name: string;
  categoryName: string | null;
  unitCost: number;
  available: number;
  quantity: number;
  reason: string;
}

export interface EditionSuggestion {
  themeKey: string;
  name: string;
  theme: string;
  pitch: string;
  costBandMin: number;
  costBandMax: number;
  slips: number;
  products: number;
  maxPack: number | null;
  idleMoney: number;
  packs: PackCheck[];
  bag: BagLine[];
}

const KIND_ORDER: ThemeKind[] = ["design", "color", "brand", "category", "type"];

/** Lo que puede ir en una sugerencia: algo disponible, con costo, sin licencia pendiente. */
const suggestable = (products: readonly SuggestionProduct[]) => products.filter((product) => !product.licenseBlocked && product.available > 0 && product.unitCost > 0);

const themeKey = (kind: ThemeKind, id: string) => `${kind}:${id}`;

export function parseThemeKey(value: string | null | undefined): { kind: ThemeKind; id: string } | null {
  const [kind, ...rest] = String(value ?? "").split(":");
  const id = rest.join(":");
  return KIND_ORDER.includes(kind as ThemeKind) && id ? { kind: kind as ThemeKind, id } : null;
}

export const matchesTheme = (product: SuggestionProduct, key: string) => {
  const parsed = parseThemeKey(key);
  return parsed !== null && product.attributes[parsed.kind]?.id === parsed.id;
};

/**
 * Los temas posibles: cada valor de diseño, color, marca, subcategoría o tipo
 * con al menos `minProducts` productos y que no cubra más de
 * `genericThemeShare` del total (así un valor por defecto, como un diseño que
 * tiene casi todo, no es tema).
 */
export function buildThemes(products: readonly SuggestionProduct[]): Theme[] {
  const counts = new Map<string, { theme: Theme; count: number }>();
  for (const product of products) {
    for (const kind of KIND_ORDER) {
      const value = product.attributes[kind];
      if (!value) continue;
      const key = themeKey(kind, value.id);
      const entry = counts.get(key) ?? { theme: { key, kind, label: value.name }, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  const limit = products.length * SUGGESTION_RULES.genericThemeShare;
  return Array.from(counts.values())
    .filter((entry) => entry.count >= SUGGESTION_RULES.minProducts && entry.count <= limit)
    .sort((a, b) => KIND_ORDER.indexOf(a.theme.kind) - KIND_ORDER.indexOf(b.theme.kind) || b.count - a.count || a.theme.label.localeCompare(b.theme.label))
    .map((entry) => entry.theme);
}

/** Los más quietos primero: nunca vendidos en el año, luego más días sin venta, luego más plata quieta. */
const byIdleness = (a: SuggestionProduct, b: SuggestionProduct) =>
  (b.daysSinceLastSale ?? Infinity) - (a.daysSinceLastSale ?? Infinity) || b.available * b.unitCost - a.available * a.unitCost || a.name.localeCompare(b.name);

/** Papeles por producto y total de la bolsa con el tope del 20 % por producto y el máximo de papeles. */
function allocate(products: readonly SuggestionProduct[]): Map<string, number> {
  const ordered = [...products].sort(byIdleness);
  let total = Math.min(SUGGESTION_RULES.maxSlips, ordered.reduce((sum, product) => sum + product.available, 0));
  for (let pass = 0; pass < 20; pass += 1) {
    const cap = Math.max(1, Math.floor(total * SUGGESTION_RULES.maxProductShare));
    const next = Math.min(SUGGESTION_RULES.maxSlips, ordered.reduce((sum, product) => sum + Math.min(product.available, cap), 0));
    if (next === total) break;
    total = next;
  }
  const cap = Math.max(1, Math.floor(total * SUGGESTION_RULES.maxProductShare));
  const quantities = new Map<string, number>();
  let left = total;
  for (const product of ordered) {
    if (left <= 0) break;
    const quantity = Math.min(product.available, cap, left);
    if (quantity > 0) quantities.set(product.id, quantity);
    left -= quantity;
  }
  return quantities;
}

const bagTotal = (quantities: Map<string, number>) => Array.from(quantities.values()).reduce((sum, quantity) => sum + quantity, 0);

const meetsBagRules = (quantities: Map<string, number>) => {
  const total = bagTotal(quantities);
  return total >= SUGGESTION_RULES.minSlips && quantities.size >= SUGGESTION_RULES.minProducts && Array.from(quantities.values()).every((quantity) => quantity <= total * SUGGESTION_RULES.maxProductShare);
};

/**
 * La banda de costo con más papeles posibles: ventanas [mínimo, 1,7 × mínimo]
 * sobre los costos de los productos, cada una con su bolsa armada.
 */
function bestWindow(products: readonly SuggestionProduct[]): SuggestionProduct[] | null {
  const sorted = [...products].sort((a, b) => a.unitCost - b.unitCost);
  let best: { members: SuggestionProduct[]; slips: number; money: number } | null = null;
  for (let start = 0; start < sorted.length; start += 1) {
    const ceiling = sorted[start].unitCost * SUGGESTION_RULES.maxBandRatio;
    const members = sorted.slice(start).filter((product) => product.unitCost <= ceiling);
    if (members.length < SUGGESTION_RULES.minProducts) continue;
    const quantities = allocate(members);
    if (!meetsBagRules(quantities)) continue;
    const slips = bagTotal(quantities);
    const money = members.reduce((sum, product) => sum + (quantities.get(product.id) ?? 0) * product.unitCost, 0);
    if (!best || slips > best.slips || (slips === best.slips && money > best.money)) best = { members, slips, money };
  }
  return best?.members ?? null;
}

const FORBIDDEN_COPY = /\$|\bpesos?\b|\bcop\b|\bsuerte\b|\bpremi|\bgan(a|as|ar|e)\b|\bsorteo|vale\s+m[aá]s|\d{1,3}[.,]\d{3}/i;

/** Texto público seguro: sin dinero, ni azar, ni promesas de valor. */
export const isSafeCopy = (text: string) => !FORBIDDEN_COPY.test(text);

function themePhrase(theme: Theme): string {
  switch (theme.kind) {
    case "design":
      return `de diseño ${theme.label}`;
    case "color":
      return `en ${theme.label.toLowerCase()}`;
    case "brand":
      return `de ${theme.label}`;
    default:
      return `de ${theme.label.toLowerCase()}`;
  }
}

/** Nombre, tema y frase de plantilla: solo el tema, los conteos y las subcategorías, nunca nombres de producto. */
export function suggestionCopy(theme: Theme, slips: number, products: number, categoryNames: readonly string[]) {
  const name = `Edición ${theme.label}`.slice(0, 120);
  const label = theme.label.slice(0, 60);
  const top = Array.from(new Set(categoryNames.filter(Boolean))).slice(0, 3).map((value) => value.toLowerCase());
  const full = `${slips} cápsulas con ${products} productos ${themePhrase(theme)}${top.length ? `: ${top.join(", ")}` : ""}.`;
  const fallback = `${slips} cápsulas con ${products} productos distintos.`;
  return { name: isSafeCopy(name) ? name : "Edición sugerida", theme: isSafeCopy(label) ? label : "sugerida", pitch: isSafeCopy(full) ? full : fallback };
}

export function idleReasonOf(product: Pick<SuggestionProduct, "daysSinceLastSale">) {
  return product.daysSinceLastSale === null ? "Sin ventas en el último año" : `${product.daysSinceLastSale} días sin venta`;
}

function bagLines(products: readonly SuggestionProduct[], quantities: Map<string, number>, theme: Theme | null): BagLine[] {
  return [...products]
    .filter((product) => quantities.has(product.id))
    .sort(byIdleness)
    .map((product) => ({
      productId: product.id,
      name: product.name,
      categoryName: product.categoryName,
      unitCost: product.unitCost,
      available: product.available,
      quantity: quantities.get(product.id)!,
      reason: [idleReasonOf(product), "cabe en la banda", theme ? `tema ${theme.label}` : null, product.onMercadoLibre ? "en Mercado Libre: se ajusta al imprimir" : null].filter(Boolean).join(" · "),
    }));
}

const poolOf = (products: readonly SuggestionProduct[], quantities: Map<string, number>) =>
  products.flatMap((product) => Array.from({ length: quantities.get(product.id) ?? 0 }, () => product.unitCost));

/**
 * La bolsa de un tema que pasa el margen: arma la mejor banda y, si algún pack
 * queda bajo el piso, quita el producto más caro y vuelve a probar.
 */
export function bagForTheme({
  products,
  theme,
  options,
  minMarginPct,
  rejections = NO_REJECTIONS,
}: {
  products: readonly SuggestionProduct[];
  theme: Theme;
  options: readonly CapsulePackCosts[];
  minMarginPct: number;
  rejections?: Rejections;
}): EditionSuggestion | null {
  let members = bestWindow(products.filter((product) => matchesTheme(product, theme.key) && !rejections.pairs.has(rejectionPair(theme.key, product.id))));
  while (members && members.length >= SUGGESTION_RULES.minProducts) {
    const quantities = allocate(members);
    if (!meetsBagRules(quantities)) return null;
    const pool = poolOf(members, quantities);
    const search = evaluatePoolMargins({ pool, options, minMarginPct, runs: SUGGESTION_RULES.searchRuns });
    if (search.ok) {
      const confirmed = evaluatePoolMargins({ pool, options, minMarginPct, runs: SUGGESTION_RULES.confirmRuns });
      if (confirmed.ok) {
        const chosen = members.filter((product) => quantities.has(product.id));
        const costs = chosen.map((product) => product.unitCost);
        const copy = suggestionCopy(
          theme,
          pool.length,
          chosen.length,
          chosen.map((product) => product.categoryName ?? ""),
        );
        return {
          themeKey: theme.key,
          ...copy,
          costBandMin: Math.min(...costs),
          costBandMax: Math.max(...costs),
          slips: pool.length,
          products: chosen.length,
          maxPack: maxPackFor(pool.length),
          idleMoney: Math.round(pool.reduce((sum, cost) => sum + cost, 0)),
          packs: confirmed.packs,
          bag: bagLines(chosen, quantities, theme),
        };
      }
    }
    const mostExpensive = members.reduce((top, product) => (product.unitCost > top.unitCost ? product : top), members[0]);
    members = members.filter((product) => product.id !== mostExpensive.id);
  }
  return null;
}

/**
 * Hasta `maxSuggestions` ediciones sin productos repetidos entre ellas: en
 * cada vuelta gana el tema que libera más plata quieta y sus productos salen
 * del resto. Solo entran las que pasan todos los packs que caben.
 */
export function suggestEditions({
  products: all,
  options,
  minMarginPct,
  minSlipCost,
  limit = SUGGESTION_RULES.maxSuggestions,
  rejections = NO_REJECTIONS,
}: {
  products: readonly SuggestionProduct[];
  options: readonly CapsulePackCosts[];
  minMarginPct: number;
  minSlipCost: number | null;
  limit?: number;
  rejections?: Rejections;
}): EditionSuggestion[] {
  const products = suggestable(all).filter((product) => minSlipCost === null || product.unitCost >= minSlipCost);
  const themes = buildThemes(products);
  const used = new Set<string>();
  const suggestions: EditionSuggestion[] = [];
  const blocked = new Set<string>(rejections.themes);
  while (suggestions.length < limit) {
    const remaining = products.filter((product) => !used.has(product.id));
    const ranked = themes
      .filter((theme) => !blocked.has(theme.key))
      .map((theme) => {
        const members = remaining.filter((product) => matchesTheme(product, theme.key) && !rejections.pairs.has(rejectionPair(theme.key, product.id)));
        const window = bestWindow(members);
        if (!window) return null;
        const quantities = allocate(window);
        const money = window.reduce((sum, product) => sum + (quantities.get(product.id) ?? 0) * product.unitCost, 0);
        return { theme, money };
      })
      .filter((entry): entry is { theme: Theme; money: number } => entry !== null)
      .sort((a, b) => b.money - a.money || a.theme.key.localeCompare(b.theme.key));
    let picked: EditionSuggestion | null = null;
    for (const { theme } of ranked) {
      picked = bagForTheme({ products: remaining, theme, options, minMarginPct, rejections });
      if (picked) break;
      blocked.add(theme.key);
    }
    if (!picked) break;
    suggestions.push(picked);
    blocked.add(picked.themeKey);
    for (const line of picked.bag) used.add(line.productId);
  }
  return suggestions;
}

/**
 * La bolsa sugerida para una edición que ya existe: su banda, el tema que
 * eligió Paula y los papeles ya impresos cuentan para el 20 % y los 150.
 * No mide margen: eso lo hace «Revisar margen» con la bolsa que Paula deje.
 */
export function suggestBagForEdition({
  products: all,
  themeKey: key,
  costBandMin,
  costBandMax,
  printed,
  rejections = NO_REJECTIONS,
}: {
  products: readonly SuggestionProduct[];
  themeKey: string | null;
  costBandMin: number;
  costBandMax: number;
  printed: ReadonlyMap<string, number>;
  rejections?: Rejections;
}): BagLine[] {
  const parsed = key ? parseThemeKey(key) : null;
  const ordered = suggestable(all)
    .filter((product) => product.unitCost >= costBandMin && product.unitCost <= costBandMax && (!key || (matchesTheme(product, key) && !rejections.pairs.has(rejectionPair(key, product.id)))))
    .sort(byIdleness);
  const printedTotal = Array.from(printed.values()).reduce((sum, quantity) => sum + quantity, 0);
  const addable = (product: SuggestionProduct, cap: number) => Math.max(0, Math.min(product.available, cap - (printed.get(product.id) ?? 0)));
  let total = Math.min(SUGGESTION_RULES.maxSlips, printedTotal + ordered.reduce((sum, product) => sum + product.available, 0));
  for (let pass = 0; pass < 20; pass += 1) {
    const cap = Math.max(1, Math.floor(total * SUGGESTION_RULES.maxProductShare));
    const next = Math.min(SUGGESTION_RULES.maxSlips, printedTotal + ordered.reduce((sum, product) => sum + addable(product, cap), 0));
    if (next === total) break;
    total = next;
  }
  const cap = Math.max(1, Math.floor(total * SUGGESTION_RULES.maxProductShare));
  const quantities = new Map<string, number>();
  let left = total - printedTotal;
  for (const product of ordered) {
    if (left <= 0) break;
    const quantity = Math.min(addable(product, cap), left);
    if (quantity > 0) quantities.set(product.id, quantity);
    left -= quantity;
  }
  const label = parsed ? ordered.find((product) => product.attributes[parsed.kind]?.id === parsed.id)?.attributes[parsed.kind]?.name : undefined;
  return bagLines(ordered, quantities, parsed && label ? { key: key!, kind: parsed.kind, label } : null);
}

/**
 * «Te faltan estos»: productos quietos que no están en ninguna sugerencia,
 * agrupados por su primer tema; los que cuestan menos que el piso de un papel
 * van marcados para regalo.
 */
export function missingProducts({
  products: all,
  suggestions,
  minSlipCost,
}: {
  products: readonly SuggestionProduct[];
  suggestions: readonly EditionSuggestion[];
  minSlipCost: number | null;
}) {
  const products = suggestable(all);
  const themes = buildThemes(products);
  const used = new Set(suggestions.flatMap((suggestion) => suggestion.bag.map((line) => line.productId)));
  const groups = new Map<string, { themeKey: string | null; label: string; products: { productId: string; name: string; available: number; unitCost: number; reason: string; gift: boolean }[] }>();
  for (const product of [...products].sort(byIdleness)) {
    if (used.has(product.id)) continue;
    const theme = themes.find((candidate) => matchesTheme(product, candidate.key)) ?? null;
    const groupKey = theme?.key ?? "sin-tema";
    const group = groups.get(groupKey) ?? { themeKey: theme?.key ?? null, label: theme?.label ?? "Sin tema", products: [] };
    const gift = minSlipCost !== null && product.unitCost < minSlipCost;
    group.products.push({ productId: product.id, name: product.name, available: product.available, unitCost: product.unitCost, reason: `${idleReasonOf(product)}${gift ? " · para regalo" : ""}`, gift });
    groups.set(groupKey, group);
  }
  return Array.from(groups.values()).sort((a, b) => Number(a.themeKey === null) - Number(b.themeKey === null) || b.products.length - a.products.length);
}
