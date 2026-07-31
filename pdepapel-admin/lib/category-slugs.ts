import { Prisma, PrismaClient } from "@prisma/client";

type CategorySlugClient = PrismaClient | Prisma.TransactionClient;

interface UniqueCategorySlugOptions {
  storeId: string;
  baseSlug: string;
  excludeCategoryId?: string;
}

interface CategorySlugAliasOptions {
  storeId: string;
  categoryId: string;
  slug: string;
}

export async function getUniqueCategorySlug(
  client: CategorySlugClient,
  { storeId, baseSlug, excludeCategoryId }: UniqueCategorySlugOptions,
) {
  const normalizedBaseSlug = baseSlug || "categoria";
  let slug = normalizedBaseSlug;
  let suffix = 2;

  while (true) {
    const [categoryWithSlug, aliasWithSlug] = await Promise.all([
      client.category.findFirst({
        where: {
          storeId,
          slug,
          ...(excludeCategoryId && { NOT: { id: excludeCategoryId } }),
        },
        select: { id: true },
      }),
      client.categorySlugAlias.findUnique({
        where: { storeId_slug: { storeId, slug } },
        select: { categoryId: true },
      }),
    ]);

    const aliasBelongsToExcludedCategory =
      aliasWithSlug?.categoryId === excludeCategoryId;

    if (
      !categoryWithSlug &&
      (!aliasWithSlug || aliasBelongsToExcludedCategory)
    ) {
      return slug;
    }

    slug = `${normalizedBaseSlug}-${suffix}`;
    suffix += 1;
  }
}

export async function preserveCategorySlugAlias(
  client: CategorySlugClient,
  { storeId, categoryId, slug }: CategorySlugAliasOptions,
) {
  if (!slug) return;

  const [categoryWithSlug, existingAlias] = await Promise.all([
    client.category.findFirst({
      where: {
        storeId,
        slug,
        NOT: { id: categoryId },
      },
      select: { id: true },
    }),
    client.categorySlugAlias.findUnique({
      where: { storeId_slug: { storeId, slug } },
      select: { categoryId: true },
    }),
  ]);

  if (
    categoryWithSlug ||
    (existingAlias && existingAlias.categoryId !== categoryId)
  ) {
    return;
  }
  if (existingAlias) return;

  await client.categorySlugAlias.create({
    data: { storeId, categoryId, slug },
  });
}
