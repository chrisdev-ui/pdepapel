import { CapsuleEditionStatus, CapsuleSlipKind, CapsuleSlipStatus, CapsuleSuggestionDecision } from "@prisma/client";

import { availableStock } from "@/lib/available-stock";
import { ErrorFactory } from "@/lib/api-errors";
import { stripTaxonomyIcon } from "@/lib/category-seo";
import { loadIdleProducts } from "@/lib/capsule-idle";
import { detectLicense } from "@/lib/capsule-licenses";
import { resolveSuggestionPackOptions } from "@/lib/capsule-settings";
import {
  missingProducts,
  parseThemeKey,
  rejectionPair,
  SCORING_VERSION,
  suggestBagForEdition,
  suggestEditions,
  type Rejections,
  type SuggestionProduct,
} from "@/lib/capsule-suggestions";
import prismadb from "@/lib/prismadb";

/**
 * Lo que leen de la base las ediciones sugeridas: los productos quietos con
 * sus atributos, los ✗ de Paula y los ajustes de la tienda. Todo es de la
 * dueña (lleva costos y bandas): las rutas lo piden con `verifyStoreOwner`.
 */

const label = (value: { id: string; name: string }) => ({ id: value.id, name: stripTaxonomyIcon(value.name) || value.name });

const OPEN_EDITION_STATUSES = [CapsuleEditionStatus.DRAFT, CapsuleEditionStatus.PREVIEW, CapsuleEditionStatus.LIVE];

interface LicenseReviewRow {
  productId: string;
  name: string;
  term: string;
  allowed: boolean;
}

async function loadSuggestionProducts(storeId: string, { exceptEditionId }: { exceptEditionId?: string } = {}) {
  const idle = await loadIdleProducts(storeId);
  if (idle.size === 0) return { products: [] as SuggestionProduct[], licenses: [] as LicenseReviewRow[] };
  const [rows, inOpenEditions] = await Promise.all([
    prismadb.product.findMany({
      where: { storeId, id: { in: Array.from(idle.keys()) }, isArchived: false, isKit: false, capsuleEdition: { is: null } },
      select: {
        id: true,
        name: true,
        stock: true,
        reservedUnits: true,
        acqPrice: true,
        capsuleLicenseAllowed: true,
        design: { select: { id: true, name: true } },
        color: { select: { id: true, name: true } },
        brandRef: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, type: { select: { id: true, name: true } } } },
        productGroup: { select: { name: true } },
        marketplaceListings: { select: { id: true }, take: 1 },
      },
    }),
    prismadb.capsuleSlip.findMany({
      where: { storeId, kind: CapsuleSlipKind.SLIP, status: CapsuleSlipStatus.PRINTED, edition: { status: { in: OPEN_EDITION_STATUSES } }, ...(exceptEditionId ? { editionId: { not: exceptEditionId } } : {}) },
      select: { productId: true },
      distinct: ["productId"],
    }),
  ]);
  const taken = new Set(inOpenEditions.map((slip) => slip.productId));
  const licenses: LicenseReviewRow[] = [];
  const products: SuggestionProduct[] = [];
  for (const row of rows) {
    if (taken.has(row.id)) continue;
    const info = idle.get(row.id)!;
    const term = detectLicense([row.name, row.design?.name, row.brandRef?.name, row.productGroup?.name]);
    if (term) licenses.push({ productId: row.id, name: row.name, term, allowed: row.capsuleLicenseAllowed });
    products.push({
      id: row.id,
      name: row.name,
      unitCost: Number(row.acqPrice ?? 0),
      available: availableStock(row),
      daysSinceLastSale: info.daysSinceLastSale,
      daysInStock: info.daysInStock,
      // Los nombres de taxonomía llevan ícono al inicio; en textos y temas van sin él.
      attributes: {
        ...(row.design ? { design: label(row.design) } : {}),
        ...(row.color ? { color: label(row.color) } : {}),
        ...(row.brandRef ? { brand: label(row.brandRef) } : {}),
        ...(row.category ? { category: label(row.category) } : {}),
        ...(row.category?.type ? { type: label(row.category.type) } : {}),
      },
      categoryName: row.category ? stripTaxonomyIcon(row.category.name) : null,
      onMercadoLibre: row.marketplaceListings.length > 0,
      licenseBlocked: term !== null && !row.capsuleLicenseAllowed,
    });
  }
  licenses.sort((a, b) => Number(a.allowed) - Number(b.allowed) || a.name.localeCompare(b.name));
  return { products, licenses };
}

/** El último ✓/✗ manda: un ✓ posterior deshace un ✗. */
async function loadRejections(storeId: string): Promise<Rejections> {
  const rows = await prismadb.capsuleSuggestionFeedback.findMany({
    where: { storeId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { themeKey: true, productId: true, decision: true },
  });
  const latest = new Map<string, CapsuleSuggestionDecision>();
  for (const row of rows) latest.set(row.productId ? rejectionPair(row.themeKey, row.productId) : row.themeKey, row.decision);
  const themes = new Set<string>();
  const pairs = new Set<string>();
  latest.forEach((decision, key) => {
    if (decision !== CapsuleSuggestionDecision.REJECTED) return;
    (key.includes("|") ? pairs : themes).add(key);
  });
  return { themes, pairs };
}

/** Nombres para «Descartadas»: el tema por sus productos o su tabla; el producto por su nombre. */
async function describeRejections(storeId: string, rejections: Rejections, products: readonly SuggestionProduct[]) {
  const labels = new Map<string, string>();
  for (const product of products) {
    for (const [kind, value] of Object.entries(product.attributes)) if (value) labels.set(`${kind}:${value.id}`, value.name);
  }
  const keys = [...Array.from(rejections.themes), ...Array.from(rejections.pairs).map((pair) => pair.split("|")[0])];
  const missing = (kind: string) => Array.from(new Set(keys.filter((key) => !labels.has(key)).map((key) => parseThemeKey(key)).filter((parsed) => parsed?.kind === kind).map((parsed) => parsed!.id)));
  const [designs, colors, brands, categories, types] = await Promise.all([
    missing("design").length ? prismadb.design.findMany({ where: { storeId, id: { in: missing("design") } }, select: { id: true, name: true } }) : [],
    missing("color").length ? prismadb.color.findMany({ where: { storeId, id: { in: missing("color") } }, select: { id: true, name: true } }) : [],
    missing("brand").length ? prismadb.brand.findMany({ where: { storeId, id: { in: missing("brand") } }, select: { id: true, name: true } }) : [],
    missing("category").length ? prismadb.category.findMany({ where: { storeId, id: { in: missing("category") } }, select: { id: true, name: true } }) : [],
    missing("type").length ? prismadb.type.findMany({ where: { storeId, id: { in: missing("type") } }, select: { id: true, name: true } }) : [],
  ]);
  for (const [kind, rows] of [["design", designs], ["color", colors], ["brand", brands], ["category", categories], ["type", types]] as const) {
    for (const row of rows) labels.set(`${kind}:${row.id}`, label(row).name);
  }
  const pairIds = Array.from(new Set(Array.from(rejections.pairs).map((pair) => pair.split("|")[1])));
  const names = new Map(
    (pairIds.length ? await prismadb.product.findMany({ where: { storeId, id: { in: pairIds } }, select: { id: true, name: true } }) : []).map((row) => [row.id, row.name]),
  );
  const themeLabel = (key: string) => labels.get(key) ?? "Tema sin productos";
  return {
    themes: Array.from(rejections.themes).map((key) => ({ themeKey: key, label: themeLabel(key) })),
    products: Array.from(rejections.pairs)
      .map((pair) => {
        const [key, productId] = pair.split("|");
        return { themeKey: key, themeLabel: themeLabel(key), productId, name: names.get(productId) ?? "" };
      })
      .filter((row) => row.name),
  };
}

/** «Ediciones sugeridas», «Te faltan estos», «Revisar licencia» y «Descartadas» en una sola lectura. */
export async function getEditionSuggestions(storeId: string) {
  const [store, packs, { products, licenses }, rejections] = await Promise.all([
    prismadb.store.findUnique({ where: { id: storeId }, select: { storeMinMarginPercent: true, capsuleMinSlipCost: true } }),
    resolveSuggestionPackOptions(storeId),
    loadSuggestionProducts(storeId),
    loadRejections(storeId),
  ]);
  const minMarginPct = store?.storeMinMarginPercent ?? null;
  const minSlipCost = store?.capsuleMinSlipCost ?? null;
  const ready = packs !== null && minMarginPct !== null;
  const suggestions = ready ? suggestEditions({ products, options: packs.options, minMarginPct, minSlipCost, rejections }) : [];
  return {
    scoringVersion: SCORING_VERSION,
    minMarginPct,
    minSlipCost,
    packSource: packs ? { source: packs.source, edition: packs.edition } : null,
    missingSetup: packs === null ? ("packs" as const) : minMarginPct === null ? ("margin" as const) : null,
    idleProducts: products.length,
    suggestions,
    missing: missingProducts({ products, suggestions, minSlipCost }),
    licenses,
    rejected: await describeRejections(storeId, rejections, products),
  };
}

/** «Sugerir bolsa» de una edición abierta: su banda, el tema elegido y lo ya impreso. */
export async function getSuggestedBag({ storeId, editionId, themeKey }: { storeId: string; editionId: string; themeKey: string | null }) {
  const edition = await prismadb.capsuleEdition.findFirst({ where: { id: editionId, storeId }, select: { id: true, status: true, costBandMin: true, costBandMax: true } });
  if (!edition) throw ErrorFactory.NotFound("Edición no encontrada");
  const [{ products }, printedRows, rejections] = await Promise.all([
    loadSuggestionProducts(storeId, { exceptEditionId: editionId }),
    prismadb.capsuleSlip.groupBy({ by: ["productId"], where: { editionId, kind: CapsuleSlipKind.SLIP, status: CapsuleSlipStatus.PRINTED }, _count: { _all: true } }),
    loadRejections(storeId),
  ]);
  const printed = new Map(printedRows.map((row) => [row.productId, row._count._all]));
  const inBand = products.filter((product) => !product.licenseBlocked && product.available > 0 && product.unitCost >= edition.costBandMin && product.unitCost <= edition.costBandMax);
  const themes = new Map<string, { key: string; label: string; count: number }>();
  for (const product of inBand) {
    for (const [kind, value] of Object.entries(product.attributes)) {
      if (!value) continue;
      const key = `${kind}:${value.id}`;
      const entry = themes.get(key) ?? { key, label: value.name, count: 0 };
      entry.count += 1;
      themes.set(key, entry);
    }
  }
  return {
    themes: Array.from(themes.values()).filter((theme) => !rejections.themes.has(theme.key)).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 40),
    bag: suggestBagForEdition({ products, themeKey, costBandMin: edition.costBandMin, costBandMax: edition.costBandMax, printed, rejections }).map((line) => ({
      ...line,
      printed: printed.get(line.productId) ?? 0,
    })),
  };
}

export async function recordSuggestionFeedback({ storeId, userId, body }: { storeId: string; userId: string; body: unknown }) {
  const raw = (body ?? {}) as Record<string, unknown>;
  const themeKey = typeof raw.themeKey === "string" ? raw.themeKey.trim().slice(0, 120) : "";
  if (!themeKey) throw ErrorFactory.InvalidRequest("Falta el tema de la sugerencia");
  const decision = raw.decision === "ACCEPTED" ? CapsuleSuggestionDecision.ACCEPTED : raw.decision === "REJECTED" ? CapsuleSuggestionDecision.REJECTED : null;
  if (!decision) throw ErrorFactory.InvalidRequest("La decisión es ✓ o ✗");
  const productId = typeof raw.productId === "string" && raw.productId ? raw.productId : null;
  if (productId && !(await prismadb.product.findFirst({ where: { id: productId, storeId }, select: { id: true } }))) throw ErrorFactory.NotFound("Producto no encontrado");
  const reason = typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim().slice(0, 160) : null;
  return prismadb.capsuleSuggestionFeedback.create({
    data: { storeId, themeKey, productId, decision, reason, scoringVersion: SCORING_VERSION, createdBy: userId },
    select: { id: true, themeKey: true, productId: true, decision: true },
  });
}

/** «Permitir en cápsulas» de un producto de personaje o licencia. Sin tocar `updatedAt` (el lastmod del sitemap). */
export async function setCapsuleLicenseAllowed({ storeId, productId, allowed }: { storeId: string; productId: string; allowed: unknown }) {
  if (typeof allowed !== "boolean") throw ErrorFactory.InvalidRequest("Indica si se permite o no");
  const changed = await prismadb.$executeRaw`UPDATE \`Product\` SET \`capsuleLicenseAllowed\` = ${allowed} WHERE \`id\` = ${productId} AND \`storeId\` = ${storeId}`;
  if (changed === 0) {
    const exists = await prismadb.product.findFirst({ where: { id: productId, storeId }, select: { id: true } });
    if (!exists) throw ErrorFactory.NotFound("Producto no encontrado");
  }
  return { productId, allowed };
}
