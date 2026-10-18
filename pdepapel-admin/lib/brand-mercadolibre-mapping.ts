import type { Prisma } from "@prisma/client";

import {
  planBrandCreations,
  planFingerprint,
  writeBrandPlan,
  type BrandInitialPlan,
  type BrandSeed,
  type ManualReviewRow,
  type PlanBrand,
  type PlanGroup,
  type PlanProduct,
  type TextDecision,
} from "@/lib/brand-initial-data";
import { brandKey } from "@/lib/brand-rules";

/**
 * Marcas desde el atributo BRAND de las publicaciones activas de Mercado Libre
 * cuyo producto aún no tiene marca en el panel. Christian decide cada valor
 * (a una marca, a una nueva oculta o a ninguna). Como en los datos iniciales,
 * un producto de un grupo arrastra a todo el grupo, y el plan del ensayo se
 * vuelve a calcular dentro de la transacción de escritura.
 */

export interface MercadoLibreBrandConfig {
  storeId: string;
  brands: BrandSeed[];
  /** Valor de BRAND (comparado con `brandKey`) → marca o ninguna. */
  valueMapping: Record<string, TextDecision>;
}

export interface MercadoLibreBrandListing {
  externalItemId: string;
  productId: string;
  mlBrand: string;
}

export const VIA_LISTING = "BRAND de Mercado Libre";
export const VIA_GROUP = "grupo";

export function planBrandsFromMercadoLibre(input: {
  config: MercadoLibreBrandConfig;
  listings: MercadoLibreBrandListing[];
  existingBrands: PlanBrand[];
  products: PlanProduct[];
  groups: PlanGroup[];
}): BrandInitialPlan {
  const { config, listings, existingBrands, products, groups } = input;
  const createBrands = planBrandCreations(config.brands, existingBrands);
  const nameByKey = new Map<string, string>([
    ...existingBrands.filter((brand) => !brand.isArchived).map((brand) => [brandKey(brand.name), brand.name] as const),
    ...createBrands.map((brand) => [brandKey(brand.name), brand.name] as const),
  ]);
  const decisionByKey = new Map(Object.entries(config.valueMapping).map(([value, decision]) => [brandKey(value), decision]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const groupById = new Map(groups.map((group) => [group.id, group]));

  const manualReview: ManualReviewRow[] = [];
  const brandsByUnit = new Map<string, Set<string>>();
  const listedProducts = new Set<string>();

  for (const listing of [...listings].sort((a, b) => a.externalItemId.localeCompare(b.externalItemId))) {
    const product = productById.get(listing.productId);
    if (!product || product.brandId) continue;
    const decision = decisionByKey.get(brandKey(listing.mlBrand));
    if (!decision) {
      manualReview.push({ kind: "product", id: product.id, reason: `BRAND de Mercado Libre sin decisión: «${listing.mlBrand}»` });
      continue;
    }
    if ("none" in decision) continue;
    const brand = nameByKey.get(brandKey(decision.brand));
    if (!brand) {
      manualReview.push({ kind: "product", id: product.id, reason: `«${listing.mlBrand}» → ${decision.brand} (esa marca no existe)` });
      continue;
    }
    const unit = product.productGroupId ? `group:${product.productGroupId}` : `product:${product.id}`;
    const set = brandsByUnit.get(unit) ?? new Set<string>();
    set.add(brand);
    brandsByUnit.set(unit, set);
    listedProducts.add(product.id);
  }

  const variantsByGroup = new Map<string, PlanProduct[]>();
  for (const product of products) {
    if (!product.productGroupId) continue;
    const list = variantsByGroup.get(product.productGroupId) ?? [];
    list.push(product);
    variantsByGroup.set(product.productGroupId, list);
  }

  const groupAssignments: BrandInitialPlan["groupAssignments"] = [];
  const productAssignments: BrandInitialPlan["productAssignments"] = [];
  for (const [unit, brands] of Array.from(brandsByUnit.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const [kind, id] = unit.split(":") as ["group" | "product", string];
    if (brands.size > 1) {
      manualReview.push({ kind, id, reason: `publicaciones con marcas distintas: ${Array.from(brands).sort().join(" / ")}` });
      continue;
    }
    const brand = Array.from(brands)[0];
    if (kind === "product") {
      productAssignments.push({ productId: id, brand, via: VIA_LISTING });
      continue;
    }
    const group = groupById.get(id);
    const variants = variantsByGroup.get(id) ?? [];
    if (!group || group.brandId || variants.some((variant) => variant.brandId)) continue;
    groupAssignments.push({ productGroupId: id, brand, via: VIA_LISTING });
    for (const variant of [...variants].sort((a, b) => a.id.localeCompare(b.id))) {
      productAssignments.push({ productId: variant.id, brand, via: listedProducts.has(variant.id) ? VIA_LISTING : VIA_GROUP });
    }
  }

  return {
    createBrands,
    groupAssignments,
    productAssignments,
    manualReview,
    rows: createBrands.length + groupAssignments.length + productAssignments.length,
  };
}

type Db = Pick<Prisma.TransactionClient, "brand" | "product" | "productGroup">;

export async function loadMercadoLibreBrandPlan(db: Db, config: MercadoLibreBrandConfig, listings: MercadoLibreBrandListing[]) {
  const [existingBrands, products, groups] = await Promise.all([
    db.brand.findMany({
      where: { storeId: config.storeId },
      select: { id: true, name: true, aliases: true, isArchived: true, isVisible: true, parentBrandId: true },
    }),
    db.product.findMany({
      where: { storeId: config.storeId },
      select: { id: true, name: true, brand: true, brandId: true, isArchived: true, productGroupId: true },
    }),
    db.productGroup.findMany({ where: { storeId: config.storeId }, select: { id: true, name: true, brand: true, brandId: true } }),
  ]);
  return planBrandsFromMercadoLibre({ config, listings, existingBrands, products, groups });
}

/**
 * Escritura: las publicaciones del ensayo tienen que seguir activas y con el
 * mismo producto, y el plan recalculado tiene que ser idéntico y sumar N.
 */
export async function applyMercadoLibreBrandPlan(
  tx: Prisma.TransactionClient,
  config: MercadoLibreBrandConfig,
  listings: MercadoLibreBrandListing[],
  expected: Pick<BrandInitialPlan, "createBrands" | "groupAssignments" | "productAssignments">,
  expectRows: number,
  createdBy: string,
) {
  const current = await tx.marketplaceListing.findMany({
    where: { externalItemId: { in: listings.map((listing) => listing.externalItemId) }, connection: { storeId: config.storeId } },
    select: { externalItemId: true, productId: true, status: true },
  });
  const byItem = new Map(current.map((row) => [row.externalItemId, row]));
  for (const listing of listings) {
    const row = byItem.get(listing.externalItemId);
    if (!row || row.status !== "ACTIVE" || row.productId !== listing.productId) {
      throw new Error(`La publicación ${listing.externalItemId} ya no está activa o cambió de producto: vuelve a correr el ensayo. No se escribió nada.`);
    }
  }
  const plan = await loadMercadoLibreBrandPlan(tx, config, listings);
  if (planFingerprint(plan) !== planFingerprint(expected)) {
    throw new Error("El plan cambió desde el ensayo: vuelve a correr el ensayo y usa su plan y su N. No se escribió nada.");
  }
  if (plan.rows !== expectRows) throw new Error(`El plan tiene ${plan.rows} filas y se esperaban ${expectRows}. No se escribió nada.`);
  return writeBrandPlan(tx, config.storeId, plan, expectRows, createdBy);
}
