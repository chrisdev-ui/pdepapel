import { Prisma, PrismaClient } from "@prisma/client";

import { generateProductSlug } from "./slugify";

type ProductSlugClient = PrismaClient | Prisma.TransactionClient;

interface UniqueProductSlugOptions {
  storeId: string;
  baseSlug: string;
  excludeProductId?: string;
}

interface ProductSlugAliasOptions {
  storeId: string;
  productId: string;
  slug: string;
}

const buildUniqueSlug = (baseSlug: string, reservedSlugs: Set<string>) => {
  let slug = baseSlug || "producto";
  let suffix = 2;

  while (reservedSlugs.has(slug)) {
    slug = `${baseSlug || "producto"}-${suffix}`;
    suffix += 1;
  }

  return slug;
};

export async function getUniqueProductSlug(
  client: ProductSlugClient,
  { storeId, baseSlug, excludeProductId }: UniqueProductSlugOptions,
) {
  const normalizedBaseSlug = baseSlug || "producto";
  let slug = normalizedBaseSlug;
  let suffix = 2;

  while (true) {
    const [productWithSlug, aliasWithSlug] = await Promise.all([
      client.product.findFirst({
        where: {
          storeId,
          slug,
          ...(excludeProductId && { NOT: { id: excludeProductId } }),
        },
        select: { id: true },
      }),
      client.productSlugAlias.findUnique({
        where: { storeId_slug: { storeId, slug } },
        select: { productId: true },
      }),
    ]);

    const aliasBelongsToExcludedProduct =
      aliasWithSlug?.productId === excludeProductId;

    if (!productWithSlug && (!aliasWithSlug || aliasBelongsToExcludedProduct)) {
      break;
    }

    slug = `${normalizedBaseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

export async function preserveProductSlugAlias(
  client: ProductSlugClient,
  { storeId, productId, slug }: ProductSlugAliasOptions,
) {
  if (!slug) return;

  const productWithSlug = await client.product.findFirst({
    where: {
      storeId,
      slug,
      NOT: { id: productId },
    },
    select: { id: true },
  });

  if (productWithSlug) return;

  const existingAlias = await client.productSlugAlias.findUnique({
    where: { storeId_slug: { storeId, slug } },
    select: { productId: true },
  });

  if (existingAlias && existingAlias.productId !== productId) return;
  if (existingAlias) return;

  await client.productSlugAlias.create({
    data: { storeId, productId, slug },
  });
}

export async function synchronizeProductGroupSlugs(
  client: ProductSlugClient,
  storeId: string,
  productGroupId: string,
) {
  const products = await client.product.findMany({
    where: { storeId, productGroupId },
    include: {
      color: { select: { name: true, value: true } },
      design: { select: { name: true } },
      size: { select: { name: true, value: true } },
    },
    orderBy: { id: "asc" },
  });

  if (products.length === 0) return;

  const [existingSlugs, existingAliases] = await Promise.all([
    client.product.findMany({
      where: {
        storeId,
        NOT: { id: { in: products.map((product) => product.id) } },
      },
      select: { slug: true },
    }),
    client.productSlugAlias.findMany({
      where: { storeId },
      select: { slug: true },
    }),
  ]);
  const reservedSlugs = new Set(
    [...existingSlugs, ...existingAliases]
      .map((product) => product.slug)
      .filter(Boolean),
  );
  const nextSlugs = new Set<string>();
  const includeVariantAttributes = products.length > 1;

  for (const product of products) {
    const unavailableSlugs = new Set(reservedSlugs);
    nextSlugs.forEach((nextSlug) => unavailableSlugs.add(nextSlug));
    const baseSlug = generateProductSlug({
      name: product.name,
      color: product.color,
      design: product.design,
      size: product.size,
      includeVariantAttributes,
    });
    const slug = buildUniqueSlug(baseSlug, unavailableSlugs);
    nextSlugs.add(slug);

    if (slug === product.slug) continue;

    await preserveProductSlugAlias(client, {
      storeId,
      productId: product.id,
      slug: product.slug,
    });
    await client.product.update({
      where: { id: product.id },
      data: { slug },
    });
  }
}
