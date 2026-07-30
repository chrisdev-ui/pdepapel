import { PrismaClient } from "@prisma/client";

import { generateProductSlug } from "../lib/slugify";

const prismadb = new PrismaClient();
const shouldApply = process.argv.includes("--apply");

const makeUniqueSlug = (baseSlug: string, usedSlugs: Set<string>) => {
  let slug = baseSlug || "producto";
  let suffix = 2;

  while (usedSlugs.has(slug)) {
    slug = `${baseSlug || "producto"}-${suffix}`;
    suffix += 1;
  }

  return slug;
};

async function main() {
  const products = await prismadb.product.findMany({
    include: {
      color: { select: { name: true, value: true } },
      design: { select: { name: true } },
      size: { select: { name: true, value: true } },
    },
    orderBy: [{ storeId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const groupVariantCounts = new Map<string, number>();

  for (const product of products) {
    if (!product.productGroupId) continue;

    groupVariantCounts.set(
      product.productGroupId,
      (groupVariantCounts.get(product.productGroupId) || 0) + 1,
    );
  }

  const usedSlugsByStore = new Map<string, Set<string>>();
  const normalizedProducts = products.map((product) => {
    const usedSlugs =
      usedSlugsByStore.get(product.storeId) || new Set<string>();
    const includeVariantAttributes = product.productGroupId
      ? (groupVariantCounts.get(product.productGroupId) || 0) > 1
      : false;
    const slug = makeUniqueSlug(
      generateProductSlug({
        name: product.name,
        color: product.color,
        design: product.design,
        size: product.size,
        includeVariantAttributes,
      }),
      usedSlugs,
    );

    usedSlugs.add(slug);
    usedSlugsByStore.set(product.storeId, usedSlugs);

    return { ...product, normalizedSlug: slug };
  });
  const changes = normalizedProducts.filter(
    (product) => product.slug !== product.normalizedSlug,
  );
  const canonicalSlugs = new Set(
    normalizedProducts.map(
      (product) => `${product.storeId}:${product.normalizedSlug}`,
    ),
  );

  console.log(
    JSON.stringify(
      {
        mode: shouldApply ? "apply" : "dry-run",
        totalProducts: products.length,
        changedProducts: changes.length,
        sample: changes.slice(0, 20).map((product) => ({
          id: product.id,
          name: product.name,
          from: product.slug,
          to: product.normalizedSlug,
        })),
      },
      null,
      2,
    ),
  );

  if (!shouldApply || changes.length === 0) return;

  let aliasesCreated = 0;
  let aliasesSkipped = 0;

  for (const product of changes) {
    await prismadb.$transaction(async (tx) => {
      const oldSlugKey = `${product.storeId}:${product.slug}`;

      if (product.slug && !canonicalSlugs.has(oldSlugKey)) {
        const existingAlias = await tx.productSlugAlias.findUnique({
          where: {
            storeId_slug: {
              storeId: product.storeId,
              slug: product.slug,
            },
          },
          select: { productId: true },
        });

        if (!existingAlias) {
          await tx.productSlugAlias.create({
            data: {
              storeId: product.storeId,
              productId: product.id,
              slug: product.slug,
            },
          });
          aliasesCreated += 1;
        } else if (existingAlias.productId !== product.id) {
          aliasesSkipped += 1;
        }
      } else if (product.slug) {
        aliasesSkipped += 1;
      }

      await tx.product.update({
        where: { id: product.id },
        data: { slug: product.normalizedSlug },
      });
    });
  }

  console.log(
    JSON.stringify(
      {
        updatedProducts: changes.length,
        aliasesCreated,
        aliasesSkipped,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("Product slug normalization failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prismadb.$disconnect();
  });
