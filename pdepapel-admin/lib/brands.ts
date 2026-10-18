import { Prisma } from "@prisma/client";
import { z } from "zod";

import { ErrorFactory } from "@/lib/api-errors";
import { buildBrandMatcher, describeBrandMatch } from "@/lib/brand-matcher";
import {
  BRAND_NAME_MAX_LENGTH,
  BRAND_SEO_TEXT_MAX_LENGTH,
  brandKey,
  brandParentError,
  brandSlugFromName,
  checkBrandColor,
  cleanBrandName,
  normalizeBrandAliases,
  readStoredAliases,
} from "@/lib/brand-rules";
import prismadb from "@/lib/prismadb";

type Db = Prisma.TransactionClient | typeof prismadb;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || /^https?:\/\//i.test(value), "Debe ser una dirección web (https://…)");

export const brandInputSchema = z.object({
  name: z
    .string({ required_error: "El nombre es obligatorio" })
    .transform(cleanBrandName)
    .refine((value) => value.length > 0, "El nombre es obligatorio"),
  aliases: z.array(z.string().max(BRAND_NAME_MAX_LENGTH)).max(50).default([]),
  manufacturerName: optionalText(120),
  logoUrl: optionalUrl,
  logoPublicId: optionalText(255),
  logoWidth: z.number().int().positive().max(20000).nullish().transform((value) => value ?? null),
  logoHeight: z.number().int().positive().max(20000).nullish().transform((value) => value ?? null),
  logoHasBackground: z.boolean().default(false),
  logoInverseUrl: optionalUrl,
  color: z
    .string()
    .trim()
    .nullish()
    .transform((value) => (value ? value.toUpperCase() : null))
    .refine((value) => value === null || /^#[0-9A-F]{6}$/.test(value), "El color va como #RRGGBB")
    .refine((value) => value === null || checkBrandColor(value).ok, "Muy oscuro: el texto no se leería encima"),
  seoText: optionalText(BRAND_SEO_TEXT_MAX_LENGTH),
  website: optionalUrl,
  logoSourceUrl: optionalUrl,
  logoPermission: z.enum(["UNKNOWN", "ALLOWED", "PENDING", "DENIED"]).default("UNKNOWN"),
  isVisible: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  /** «Es una línea de»: la marca madre, o null. */
  parentBrandId: z
    .string()
    .trim()
    .max(191)
    .nullish()
    .transform((value) => (value ? value : null)),
});

export type BrandInput = z.infer<typeof brandInputSchema>;

/** Solo los interruptores de la lista (Visible, Compra por marca). */
export const brandFlagsSchema = z
  .object({ isVisible: z.boolean().optional(), isFeatured: z.boolean().optional() })
  .refine((value) => value.isVisible !== undefined || value.isFeatured !== undefined, "Nada que cambiar");

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function slugTaken(db: Db, storeId: string, slug: string, exceptBrandId?: string) {
  const [brand, redirect] = await Promise.all([
    db.brand.findFirst({ where: { storeId, slug, ...(exceptBrandId ? { id: { not: exceptBrandId } } : {}) }, select: { id: true } }),
    db.brandSlugRedirect.findFirst({ where: { storeId, oldSlug: slug }, select: { brandId: true } }),
  ]);
  return Boolean(brand) || Boolean(redirect && redirect.brandId !== exceptBrandId);
}

async function uniqueSlug(db: Db, storeId: string, name: string) {
  const base = brandSlugFromName(name) || "marca";
  for (let index = 1; index < 50; index++) {
    const candidate = index === 1 ? base : `${base}-${index}`;
    if (!(await slugTaken(db, storeId, candidate))) return candidate;
  }
  throw ErrorFactory.Conflict("No se pudo generar una dirección libre para la marca");
}

async function assertNameFree(db: Db, storeId: string, name: string, exceptBrandId?: string) {
  const key = brandKey(name);
  const others = await db.brand.findMany({
    where: { storeId, ...(exceptBrandId ? { id: { not: exceptBrandId } } : {}) },
    select: { name: true, isArchived: true },
  });
  const clash = others.find((brand) => brandKey(brand.name) === key);
  if (clash) {
    throw ErrorFactory.Conflict(
      clash.isArchived
        ? `Ya hay una marca archivada que se llama «${clash.name}». Desarchívala en vez de crear otra.`
        : `Ya existe la marca «${clash.name}».`,
    );
  }
}

function brandData(input: BrandInput) {
  return {
    name: input.name,
    aliases: normalizeBrandAliases(input.aliases, input.name),
    manufacturerName: input.manufacturerName,
    logoUrl: input.logoUrl,
    logoPublicId: input.logoUrl ? input.logoPublicId : null,
    logoWidth: input.logoUrl ? input.logoWidth : null,
    logoHeight: input.logoUrl ? input.logoHeight : null,
    logoHasBackground: input.logoUrl ? input.logoHasBackground : false,
    logoInverseUrl: input.logoInverseUrl,
    color: input.color,
    seoText: input.seoText,
    website: input.website,
    logoSourceUrl: input.logoSourceUrl,
    logoPermission: input.logoPermission,
    isVisible: input.isVisible,
    isFeatured: input.isFeatured,
    parentBrandId: input.parentBrandId,
  };
}

/** Líneas sin archivar de una marca. */
export async function countActiveLines(db: Db, brandId: string) {
  return db.brand.count({ where: { parentBrandId: brandId, isArchived: false } });
}

/** «Es una línea de»: un solo nivel, misma tienda, madre sin archivar y nunca ella misma. */
async function assertParentAllowed(db: Db, storeId: string, brandId: string | null, parentBrandId: string | null) {
  if (!parentBrandId) return;
  const [parent, lines] = await Promise.all([
    db.brand.findFirst({ where: { id: parentBrandId }, select: { id: true, storeId: true, parentBrandId: true, isArchived: true } }),
    brandId ? countActiveLines(db, brandId) : Promise.resolve(0),
  ]);
  const error = brandParentError({ brandId, storeId, parent, hasLines: lines > 0 });
  if (error) throw ErrorFactory.InvalidRequest(error);
}

export async function createBrand(storeId: string, userId: string, input: BrandInput) {
  return prismadb.$transaction(async (tx) => {
    await assertNameFree(tx, storeId, input.name);
    await assertParentAllowed(tx, storeId, null, input.parentBrandId);
    const last = await tx.brand.aggregate({ where: { storeId }, _max: { sortOrder: true } });
    return tx.brand.create({
      data: {
        ...brandData(input),
        storeId,
        slug: await uniqueSlug(tx, storeId, input.name),
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        createdBy: userId,
      },
    });
  });
}

/** Edita la marca. La dirección no cambia al renombrar: eso es «Cambiar dirección». */
export async function updateBrand(storeId: string, brandId: string, input: BrandInput) {
  const previous = await prismadb.brand.findFirst({ where: { id: brandId, storeId } });
  if (!previous) throw ErrorFactory.NotFound("Marca no encontrada");
  await assertNameFree(prismadb, storeId, input.name, brandId);
  // Solo si cambia: una línea archivada con su madre archivada tiene que poder guardar el resto.
  if (input.parentBrandId !== previous.parentBrandId) {
    await assertParentAllowed(prismadb, storeId, brandId, input.parentBrandId);
  }
  const brand = await prismadb.brand.update({ where: { id: brandId }, data: brandData(input) });
  const replacedLogos = [previous.logoUrl, previous.logoInverseUrl].filter(
    (url): url is string => Boolean(url) && url !== brand.logoUrl && url !== brand.logoInverseUrl,
  );
  return { brand, replacedLogos, previousParentBrandId: previous.parentBrandId };
}

export async function updateBrandFlags(storeId: string, brandId: string, flags: z.infer<typeof brandFlagsSchema>) {
  const found = await prismadb.brand.findFirst({ where: { id: brandId, storeId }, select: { id: true } });
  if (!found) throw ErrorFactory.NotFound("Marca no encontrada");
  return prismadb.brand.update({ where: { id: brandId }, data: flags });
}

/** «Cambiar dirección»: la anterior queda como redirección a la nueva. */
export async function changeBrandSlug(storeId: string, brandId: string, requested: string) {
  const slug = requested.trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug) || slug.length > 140) {
    throw ErrorFactory.InvalidRequest("La dirección solo lleva letras sin tilde, números y guiones");
  }
  return prismadb.$transaction(async (tx) => {
    const brand = await tx.brand.findFirst({ where: { id: brandId, storeId }, select: { id: true, slug: true } });
    if (!brand) throw ErrorFactory.NotFound("Marca no encontrada");
    if (brand.slug === slug) return { slug, previousSlug: null };
    if (await slugTaken(tx, storeId, slug, brandId)) throw ErrorFactory.Conflict("Esa dirección ya la usa otra marca");
    // Volver a una dirección anterior de la misma marca: deja de ser redirección.
    await tx.brandSlugRedirect.deleteMany({ where: { storeId, oldSlug: slug, brandId } });
    await tx.brandSlugRedirect.create({ data: { storeId, brandId, oldSlug: brand.slug } });
    await tx.brand.update({ where: { id: brandId }, data: { slug } });
    return { slug, previousSlug: brand.slug };
  });
}

export async function reorderBrands(storeId: string, orderedIds: string[]) {
  const unique = Array.from(new Set(orderedIds));
  const owned = await prismadb.brand.findMany({ where: { storeId, id: { in: unique } }, select: { id: true } });
  if (owned.length !== unique.length) throw ErrorFactory.InvalidRequest("Hay marcas que no son de esta tienda");
  await prismadb.$transaction(
    unique.map((id, index) => prismadb.brand.update({ where: { id }, data: { sortOrder: index } })),
  );
}

export async function countBrandProducts(db: Db, brandId: string) {
  const [products, groups] = await Promise.all([
    db.product.count({ where: { brandId } }),
    db.productGroup.count({ where: { brandId } }),
  ]);
  return { products, groups };
}

export async function setBrandArchived(storeId: string, brandId: string, isArchived: boolean) {
  const found = await prismadb.brand.findFirst({
    where: { id: brandId, storeId },
    select: { id: true, slug: true, parent: { select: { name: true, isArchived: true } } },
  });
  if (!found) throw ErrorFactory.NotFound("Marca no encontrada");
  if (isArchived && (await countActiveLines(prismadb, brandId)) > 0) {
    throw ErrorFactory.Conflict("Tiene líneas sin archivar: archívalas o pásalas a otra marca antes.");
  }
  if (!isArchived && found.parent?.isArchived) {
    throw ErrorFactory.Conflict(`Es una línea de «${found.parent.name}», que está archivada: desarchívala primero.`);
  }
  if (!isArchived) {
    // Una marca fusionada dejó su dirección redirigiendo a otra: devolverla
    // tendría dos dueños para la misma dirección.
    const takenBy = await prismadb.brandSlugRedirect.findFirst({
      where: { storeId, oldSlug: found.slug, brandId: { not: brandId } },
      select: { brand: { select: { name: true } } },
    });
    if (takenBy) {
      throw ErrorFactory.Conflict(
        `Esta marca se fusionó en «${takenBy.brand.name}» y su dirección redirige allí: no se puede desarchivar.`,
      );
    }
  }
  return prismadb.brand.update({ where: { id: brandId }, data: { isArchived } });
}

/** Borrar solo se puede sin productos ni grupos: con productos se archiva o se fusiona. */
export async function deleteBrand(storeId: string, brandId: string) {
  return prismadb.$transaction(async (tx) => {
    const brand = await tx.brand.findFirst({ where: { id: brandId, storeId } });
    if (!brand) throw ErrorFactory.NotFound("Marca no encontrada");
    if ((await tx.brand.count({ where: { parentBrandId: brandId } })) > 0) {
      throw ErrorFactory.Conflict("Tiene líneas: no se puede eliminar. Archívala cuando no tenga líneas activas.");
    }
    const counts = await countBrandProducts(tx, brandId);
    if (counts.products > 0 || counts.groups > 0) {
      throw ErrorFactory.Conflict(
        `Tiene ${counts.products} productos: no se puede eliminar. Archívala o fusiónala con otra.`,
      );
    }
    await tx.brandSlugRedirect.deleteMany({ where: { brandId } });
    await tx.brand.delete({ where: { id: brandId } });
    return brand;
  });
}

export interface MergeSummary {
  movedProducts: number;
  movedGroups: number;
  redirects: string[];
  addedAliases: string[];
  copiedLogo: boolean;
  target: { id: string; name: string; slug: string };
}

/**
 * Fusiona A en B en una sola transacción: los productos y grupos de A pasan a
 * B, la dirección de A y sus redirecciones apuntan a B, el nombre y los alias
 * de A se suman a los alias de B, el logo de A pasa a B solo si se pide y B no
 * tiene, y A queda archivada (no borrada).
 */
export async function mergeBrands(
  storeId: string,
  sourceId: string,
  targetId: string,
  options: { copyLogo: boolean },
  db: typeof prismadb = prismadb,
): Promise<MergeSummary> {
  if (sourceId === targetId) throw ErrorFactory.InvalidRequest("Elige otra marca de destino");
  return db.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.brand.findFirst({ where: { id: sourceId, storeId } }),
      tx.brand.findFirst({ where: { id: targetId, storeId } }),
    ]);
    if (!source || !target) throw ErrorFactory.NotFound("Marca no encontrada");
    if (source.isArchived) throw ErrorFactory.Conflict(`«${source.name}» ya está archivada`);
    if (target.isArchived) throw ErrorFactory.Conflict(`«${target.name}» está archivada: desarchívala antes de fusionar en ella`);
    if (target.parentBrandId === source.id) {
      throw ErrorFactory.Conflict(`«${target.name}» es una línea de «${source.name}»: no se puede fusionar una marca en una de sus líneas`);
    }
    const sourceLines = await countActiveLines(tx, source.id);
    if (sourceLines > 0 && target.parentBrandId) {
      throw ErrorFactory.Conflict(`«${source.name}» tiene líneas y «${target.name}» es una línea: las líneas quedarían en dos niveles`);
    }
    // Las líneas de A pasan a ser líneas de B.
    await tx.brand.updateMany({ where: { storeId, parentBrandId: source.id }, data: { parentBrandId: target.id } });

    const [products, groups] = await Promise.all([
      tx.product.updateMany({ where: { storeId, brandId: sourceId }, data: { brandId: targetId } }),
      tx.productGroup.updateMany({ where: { storeId, brandId: sourceId }, data: { brandId: targetId } }),
    ]);

    const movedRedirects = await tx.brandSlugRedirect.findMany({ where: { brandId: sourceId }, select: { oldSlug: true } });
    await tx.brandSlugRedirect.updateMany({ where: { brandId: sourceId }, data: { brandId: targetId } });
    const redirects = movedRedirects.map((row) => row.oldSlug);
    if (source.slug !== target.slug) {
      const existing = await tx.brandSlugRedirect.findFirst({ where: { storeId, oldSlug: source.slug } });
      if (existing) {
        await tx.brandSlugRedirect.update({ where: { id: existing.id }, data: { brandId: targetId } });
      } else {
        await tx.brandSlugRedirect.create({ data: { storeId, brandId: targetId, oldSlug: source.slug } });
      }
      redirects.unshift(source.slug);
    }

    const before = readStoredAliases(target.aliases);
    const aliases = normalizeBrandAliases(
      [...before, source.name, ...readStoredAliases(source.aliases)],
      target.name,
    );
    const beforeKeys = new Set(before.map(brandKey));
    const addedAliases = aliases.filter((alias) => !beforeKeys.has(brandKey(alias)));

    const copiedLogo = options.copyLogo && !target.logoUrl && Boolean(source.logoUrl);
    await tx.brand.update({
      where: { id: targetId },
      data: {
        aliases,
        ...(copiedLogo
          ? {
              logoUrl: source.logoUrl,
              logoPublicId: source.logoPublicId,
              logoWidth: source.logoWidth,
              logoHeight: source.logoHeight,
              logoHasBackground: source.logoHasBackground,
              logoInverseUrl: target.logoInverseUrl ?? source.logoInverseUrl,
              logoPermission: source.logoPermission,
              logoSourceUrl: target.logoSourceUrl ?? source.logoSourceUrl,
            }
          : {}),
      },
    });
    await tx.brand.update({ where: { id: sourceId }, data: { isArchived: true, isFeatured: false } });

    return {
      movedProducts: products.count,
      movedGroups: groups.count,
      redirects,
      addedAliases,
      copiedLogo,
      target: { id: target.id, name: target.name, slug: target.slug },
    };
  });
}

export interface BrandAssignmentPreview {
  requested: number;
  /** Productos elegidos que ya tienen otra marca. */
  withOtherBrand: { id: string; name: string; brandName: string }[];
  /** Variantes que cambian además de las elegidas, porque en un grupo todas llevan la misma marca. */
  extraVariants: number;
  groups: number;
}

async function expandToGroups(db: Db, storeId: string, productIds: string[]) {
  const chosen = await db.product.findMany({
    where: { storeId, id: { in: productIds } },
    select: { id: true, name: true, productGroupId: true, brandId: true, brandRef: { select: { name: true } } },
  });
  if (chosen.length !== new Set(productIds).size) throw ErrorFactory.InvalidRequest("Hay productos que no son de esta tienda");
  const groupIds = Array.from(new Set(chosen.map((row) => row.productGroupId).filter((id): id is string => Boolean(id))));
  const siblings = groupIds.length
    ? await db.product.findMany({
        where: { storeId, productGroupId: { in: groupIds }, id: { notIn: productIds } },
        select: { id: true },
      })
    : [];
  return { chosen, groupIds, siblingIds: siblings.map((row) => row.id) };
}

export async function previewBrandAssignment(
  storeId: string,
  brandId: string | null,
  productIds: string[],
): Promise<BrandAssignmentPreview> {
  const { chosen, groupIds, siblingIds } = await expandToGroups(prismadb, storeId, productIds);
  return {
    requested: chosen.length,
    withOtherBrand: chosen
      .filter((row) => row.brandId && row.brandId !== brandId)
      .map((row) => ({ id: row.id, name: row.name, brandName: row.brandRef?.name ?? "otra marca" })),
    extraVariants: siblingIds.length,
    groups: groupIds.length,
  };
}

/**
 * Asigna (o quita, con null) la marca a los productos elegidos. Un producto de
 * un grupo arrastra a su grupo y a todas sus variantes: en un grupo la marca
 * es una sola.
 */
export async function assignBrandToProducts(
  storeId: string,
  brandId: string | null,
  productIds: string[],
  db: typeof prismadb = prismadb,
) {
  if (productIds.length === 0) throw ErrorFactory.InvalidRequest("Elige al menos un producto");
  return db.$transaction(async (tx) => {
    if (brandId) {
      const brand = await tx.brand.findFirst({ where: { id: brandId, storeId }, select: { isArchived: true } });
      if (!brand) throw ErrorFactory.NotFound("Marca no encontrada");
      if (brand.isArchived) throw ErrorFactory.Conflict("La marca está archivada");
    }
    const { groupIds, siblingIds } = await expandToGroups(tx, storeId, productIds);
    const ids = Array.from(new Set([...productIds, ...siblingIds]));
    const updated = await tx.product.updateMany({ where: { storeId, id: { in: ids } }, data: { brandId } });
    if (groupIds.length > 0) {
      await tx.productGroup.updateMany({ where: { storeId, id: { in: groupIds } }, data: { brandId } });
    }
    return { updatedProducts: updated.count, productIds: ids, productGroupIds: groupIds };
  });
}

export interface BrandSuggestion {
  id: string;
  name: string;
  imageUrl: string | null;
  productGroupId: string | null;
  reason: string;
  term: string;
}

/**
 * «Sugerencias automáticas» de una marca: productos activos cuyo nombre dice
 * la marca o uno de sus alias. Los que no tienen marca van preseleccionados
 * (`clean`); los que ya tienen otra, aparte y sin contar (`conflicts`).
 */
export async function getBrandSuggestions(storeId: string, brandId: string) {
  const brand = await prismadb.brand.findFirst({
    where: { id: brandId, storeId },
    select: { id: true, name: true, aliases: true, parentBrandId: true, lines: { where: { isArchived: false }, select: { id: true, name: true, aliases: true, parentBrandId: true } } },
  });
  if (!brand) throw ErrorFactory.NotFound("Marca no encontrada");
  // Con sus líneas en el buscador: lo que dice una línea se sugiere a la línea, no a la madre.
  const match = buildBrandMatcher([brand, ...brand.lines]);
  const products = await prismadb.product.findMany({
    where: { storeId, isArchived: false, OR: [{ brandId: null }, { brandId: { not: brandId } }] },
    select: {
      id: true,
      name: true,
      productGroupId: true,
      brandId: true,
      brandRef: { select: { name: true } },
      images: { where: { isMain: true }, select: { url: true }, take: 1 },
    },
    orderBy: { name: "asc" },
  });
  const clean: BrandSuggestion[] = [];
  const conflicts: (BrandSuggestion & { currentBrandName: string })[] = [];
  for (const product of products) {
    const hit = match(product.name).find((candidate) => candidate.brandId === brand.id);
    if (!hit) continue;
    const row = {
      id: product.id,
      name: product.name,
      imageUrl: product.images[0]?.url ?? null,
      productGroupId: product.productGroupId,
      reason: describeBrandMatch(hit),
      term: hit.term,
    };
    if (product.brandId) conflicts.push({ ...row, currentBrandName: product.brandRef?.name ?? "otra marca" });
    else clean.push(row);
  }
  return { brand: { id: brand.id, name: brand.name }, clean, conflicts };
}

/** Conteos de productos por marca: activos y en total (la lista del panel). */
export async function getBrandProductCounts(storeId: string) {
  const [active, total] = await Promise.all([
    prismadb.product.groupBy({ by: ["brandId"], where: { storeId, isArchived: false, brandId: { not: null } }, _count: { _all: true } }),
    prismadb.product.groupBy({ by: ["brandId"], where: { storeId, brandId: { not: null } }, _count: { _all: true } }),
  ]);
  const counts = new Map<string, { active: number; total: number }>();
  for (const row of total) if (row.brandId) counts.set(row.brandId, { active: 0, total: row._count._all });
  for (const row of active) if (row.brandId) counts.set(row.brandId, { active: row._count._all, total: counts.get(row.brandId)?.total ?? row._count._all });
  return counts;
}
