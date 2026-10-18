import type { Prisma, PrismaClient } from "@prisma/client";

import { buildBrandMatcher } from "@/lib/brand-matcher";
import {
  brandKey,
  brandSlugFromName,
  normalizeBrandAliases,
  type BrandLogoPermissionValue,
} from "@/lib/brand-rules";

/**
 * Datos iniciales de marcas (feat/marcas): qué marcas crear y a qué productos
 * y grupos asignarlas, a partir del texto libre anterior (`brand`) y del
 * nombre del producto. El plan se calcula igual en el ensayo (solo lectura) y
 * dentro de la transacción de escritura; si no coinciden, no se escribe nada.
 * Es idempotente: lo que ya tiene marca no vuelve a entrar.
 */

export interface BrandSeed {
  name: string;
  aliases?: string[];
  manufacturerName?: string | null;
  logoPermission?: BrandLogoPermissionValue;
}

/** Decisión de Christian por texto anterior (normalizado con `normalizeBrandName`): a una marca o a ninguna. */
export type TextDecision = { brand: string } | { none: true };

export interface BrandInitialConfig {
  storeId: string;
  brands: BrandSeed[];
  textMapping: Record<string, TextDecision>;
}

export interface PlanProduct {
  id: string;
  name: string;
  brand: string | null;
  brandId: string | null;
  isArchived: boolean;
  productGroupId: string | null;
}

export interface PlanGroup {
  id: string;
  name: string;
  brand: string | null;
  brandId: string | null;
}

export interface PlanBrand {
  id: string;
  name: string;
  aliases: unknown;
  isArchived: boolean;
}

export interface ManualReviewRow {
  kind: "product" | "group";
  id: string;
  reason: string;
}

export interface BrandInitialPlan {
  createBrands: { name: string; slug: string; aliases: string[]; manufacturerName: string | null; logoPermission: BrandLogoPermissionValue }[];
  groupAssignments: { productGroupId: string; brand: string; via: string }[];
  productAssignments: { productId: string; brand: string; via: string }[];
  manualReview: ManualReviewRow[];
  rows: number;
}

type Normalize = (value: string | null | undefined) => string | null;

/** Plan puro: mismo resultado para los mismos datos. */
export function planBrandInitialData(input: {
  config: BrandInitialConfig;
  existingBrands: PlanBrand[];
  products: PlanProduct[];
  groups: PlanGroup[];
  normalize: Normalize;
}): BrandInitialPlan {
  const { config, existingBrands, products, groups, normalize } = input;
  const existingByKey = new Map(existingBrands.filter((brand) => !brand.isArchived).map((brand) => [brandKey(brand.name), brand]));

  const createBrands: BrandInitialPlan["createBrands"] = [];
  const takenSlugs = new Set<string>();
  for (const seed of config.brands) {
    if (existingByKey.has(brandKey(seed.name))) continue;
    let slug = brandSlugFromName(seed.name);
    for (let index = 2; takenSlugs.has(slug); index++) slug = `${brandSlugFromName(seed.name)}-${index}`;
    takenSlugs.add(slug);
    createBrands.push({
      name: seed.name,
      slug,
      aliases: normalizeBrandAliases(seed.aliases ?? [], seed.name),
      manufacturerName: seed.manufacturerName ?? null,
      logoPermission: seed.logoPermission ?? "UNKNOWN",
    });
  }

  const knownBrands = [
    ...existingBrands.filter((brand) => !brand.isArchived).map((brand) => ({ id: brand.id, name: brand.name, aliases: brand.aliases })),
    ...createBrands.map((brand) => ({ id: `new:${brand.name}`, name: brand.name, aliases: brand.aliases })),
  ];
  const brandNameByKey = new Map(knownBrands.map((brand) => [brandKey(brand.name), brand.name]));
  const matchBrands = buildBrandMatcher(knownBrands);

  const decideText = (text: string): { brand: string | null } | { unknown: string } => {
    const decision = config.textMapping[text];
    if (!decision) return { unknown: text };
    if ("none" in decision) return { brand: null };
    const name = brandNameByKey.get(brandKey(decision.brand));
    return name ? { brand: name } : { unknown: `${text} → ${decision.brand} (esa marca no existe)` };
  };

  const decideUnit = (texts: string[], names: string[]):
    | { brand: string; via: string }
    | { review: string }
    | null => {
    const nameHits = Array.from(new Set(names.flatMap((name) => matchBrands(name).map((hit) => hit.brandName))));
    if (texts.length > 0) {
      const decided = new Set<string | null>();
      for (const text of texts) {
        const decision = decideText(text);
        if ("unknown" in decision) return { review: `texto anterior sin decisión: «${decision.unknown}»` };
        decided.add(decision.brand);
      }
      if (decided.size > 1) return { review: `textos anteriores con marcas distintas: ${Array.from(decided).map((brand) => brand ?? "sin marca").join(" / ")}` };
      const brand = Array.from(decided)[0];
      if (!brand) return null;
      const contradicting = nameHits.filter((hit) => hit !== brand);
      if (contradicting.length > 0) return { review: `el texto dice «${brand}» y el nombre dice «${contradicting.join(", ")}»` };
      return { brand, via: "texto anterior" };
    }
    if (nameHits.length === 1) return { brand: nameHits[0], via: "nombre o alias" };
    if (nameHits.length > 1) return { review: `el nombre coincide con varias marcas: ${nameHits.join(", ")}` };
    return null;
  };

  const productsByGroup = new Map<string, PlanProduct[]>();
  for (const product of products) {
    if (!product.productGroupId) continue;
    const list = productsByGroup.get(product.productGroupId) ?? [];
    list.push(product);
    productsByGroup.set(product.productGroupId, list);
  }

  const groupAssignments: BrandInitialPlan["groupAssignments"] = [];
  const productAssignments: BrandInitialPlan["productAssignments"] = [];
  const manualReview: ManualReviewRow[] = [];

  for (const group of [...groups].sort((a, b) => a.id.localeCompare(b.id))) {
    const variants = productsByGroup.get(group.id) ?? [];
    if (group.brandId || variants.some((variant) => variant.brandId)) continue;
    const active = variants.filter((variant) => !variant.isArchived);
    if (active.length === 0) continue;
    const texts = Array.from(
      new Set([group.brand, ...variants.map((variant) => variant.brand)].map(normalize).filter((text): text is string => Boolean(text))),
    ).sort();
    const decision = decideUnit(texts, [group.name, ...active.map((variant) => variant.name)]);
    if (!decision) continue;
    if ("review" in decision) {
      manualReview.push({ kind: "group", id: group.id, reason: decision.review });
      continue;
    }
    groupAssignments.push({ productGroupId: group.id, brand: decision.brand, via: decision.via });
    for (const variant of [...variants].sort((a, b) => a.id.localeCompare(b.id))) {
      productAssignments.push({ productId: variant.id, brand: decision.brand, via: "grupo" });
    }
  }

  for (const product of [...products].sort((a, b) => a.id.localeCompare(b.id))) {
    if (product.productGroupId || product.brandId || product.isArchived) continue;
    const text = normalize(product.brand);
    const decision = decideUnit(text ? [text] : [], [product.name]);
    if (!decision) continue;
    if ("review" in decision) {
      manualReview.push({ kind: "product", id: product.id, reason: decision.review });
      continue;
    }
    productAssignments.push({ productId: product.id, brand: decision.brand, via: decision.via });
  }

  return {
    createBrands,
    groupAssignments,
    productAssignments,
    manualReview,
    rows: createBrands.length + groupAssignments.length + productAssignments.length,
  };
}

type Db = Pick<PrismaClient, "brand" | "product" | "productGroup"> | Prisma.TransactionClient;

export async function loadBrandInitialPlan(db: Db, config: BrandInitialConfig, normalize: Normalize) {
  const [existingBrands, products, groups] = await Promise.all([
    db.brand.findMany({ where: { storeId: config.storeId }, select: { id: true, name: true, aliases: true, isArchived: true } }),
    db.product.findMany({
      where: { storeId: config.storeId },
      select: { id: true, name: true, brand: true, brandId: true, isArchived: true, productGroupId: true },
    }),
    db.productGroup.findMany({
      where: { storeId: config.storeId },
      select: { id: true, name: true, brand: true, brandId: true },
    }),
  ]);
  return planBrandInitialData({ config, existingBrands, products, groups, normalize });
}

/** Lo que el ensayo guardó y la escritura vuelve a calcular: tiene que ser idéntico. */
export function planFingerprint(plan: Pick<BrandInitialPlan, "createBrands" | "groupAssignments" | "productAssignments">) {
  return JSON.stringify({
    createBrands: plan.createBrands.map((brand) => brand.name),
    groupAssignments: plan.groupAssignments.map((row) => `${row.productGroupId}:${row.brand}`),
    productAssignments: plan.productAssignments.map((row) => `${row.productId}:${row.brand}`),
  });
}

/**
 * Escribe el plan dentro de la transacción que recibe. Crea las marcas que
 * faltan, asigna grupos (y todas sus variantes) y productos sueltos, cada uno
 * solo si sigue sin marca. Si algo no cuadra con el plan del ensayo o con N,
 * lanza y no queda nada escrito.
 */
export async function applyBrandInitialPlan(
  tx: Prisma.TransactionClient,
  config: BrandInitialConfig,
  normalize: Normalize,
  expected: Pick<BrandInitialPlan, "createBrands" | "groupAssignments" | "productAssignments">,
  expectRows: number,
  createdBy: string,
) {
  const plan = await loadBrandInitialPlan(tx, config, normalize);
  if (planFingerprint(plan) !== planFingerprint(expected)) {
    throw new Error("El plan cambió desde el ensayo: vuelve a correr el ensayo y usa su plan y su N. No se escribió nada.");
  }
  if (plan.rows !== expectRows) throw new Error(`El plan tiene ${plan.rows} filas y se esperaban ${expectRows}. No se escribió nada.`);

  const last = await tx.brand.aggregate({ where: { storeId: config.storeId }, _max: { sortOrder: true } });
  let sortOrder = (last._max.sortOrder ?? -1) + 1;
  for (const brand of plan.createBrands) {
    await tx.brand.create({
      data: {
        storeId: config.storeId,
        name: brand.name,
        slug: brand.slug,
        aliases: brand.aliases,
        manufacturerName: brand.manufacturerName,
        logoPermission: brand.logoPermission,
        sortOrder: sortOrder++,
        createdBy,
      },
    });
  }
  const brands = await tx.brand.findMany({ where: { storeId: config.storeId, isArchived: false }, select: { id: true, name: true } });
  const idByName = new Map(brands.map((brand) => [brandKey(brand.name), brand.id]));
  const idOf = (name: string) => {
    const id = idByName.get(brandKey(name));
    if (!id) throw new Error(`No existe la marca «${name}». No se escribió nada.`);
    return id;
  };

  let groupsWritten = 0;
  for (const row of plan.groupAssignments) {
    const result = await tx.productGroup.updateMany({
      where: { id: row.productGroupId, storeId: config.storeId, brandId: null },
      data: { brandId: idOf(row.brand) },
    });
    groupsWritten += result.count;
  }
  let productsWritten = 0;
  for (const row of plan.productAssignments) {
    const result = await tx.product.updateMany({
      where: { id: row.productId, storeId: config.storeId, brandId: null },
      data: { brandId: idOf(row.brand) },
    });
    productsWritten += result.count;
  }
  const written = plan.createBrands.length + groupsWritten + productsWritten;
  if (written !== expectRows) throw new Error(`Se escribirían ${written} filas y se esperaban ${expectRows}. No se escribió nada.`);
  return { brandsCreated: plan.createBrands.length, groupsWritten, productsWritten, written };
}
