import { Prisma, PrismaClient } from "@prisma/client";

import { getVariantSlugAttributeInclusion } from "../lib/product-slugs";
import { generateProductSlug } from "../lib/slugify";

const prismadb = new PrismaClient();
const shouldApply = process.argv.includes("--apply");
const batchLimitArgument = process.argv.find((argument) =>
  argument.startsWith("--limit="),
);
const batchLimit = batchLimitArgument
  ? Number.parseInt(batchLimitArgument.split("=")[1] || "", 10)
  : undefined;

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
  const groupVariants = new Map<string, typeof products>();

  for (const product of products) {
    if (!product.productGroupId) continue;

    const variants = groupVariants.get(product.productGroupId) || [];
    variants.push(product);
    groupVariants.set(product.productGroupId, variants);
  }

  const usedSlugsByStore = new Map<string, Set<string>>();
  const normalizedProducts = products.map((product) => {
    const usedSlugs =
      usedSlugsByStore.get(product.storeId) || new Set<string>();
    const variants = product.productGroupId
      ? groupVariants.get(product.productGroupId) || []
      : [];
    const includeVariantAttributes = variants.length > 1;
    const slug = makeUniqueSlug(
      generateProductSlug({
        name: product.name,
        color: product.color,
        design: product.design,
        size: product.size,
        includeVariantAttributes,
        variantAttributes: getVariantSlugAttributeInclusion(variants),
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
  const changesToApply =
    shouldApply && batchLimit && batchLimit > 0
      ? changes.slice(0, batchLimit)
      : changes;
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
        applyingProducts: shouldApply ? changesToApply.length : 0,
        remainingProducts: shouldApply
          ? changes.length - changesToApply.length
          : changes.length,
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

  if (!shouldApply || changesToApply.length === 0) return;

  let aliasesCreated = 0;
  let aliasesSkipped = 0;
  let skippedProducts = 0;
  const skippedProductAliases: {
    id: string;
    name: string;
    slug: string;
    reason: string;
  }[] = [];

  for (const product of changesToApply) {
    await prismadb.$transaction(async (tx) => {
      const oldSlugKey = `${product.storeId}:${product.slug}`;
      let canPreserveOldSlug = true;

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
          try {
            await tx.productSlugAlias.create({
              data: {
                storeId: product.storeId,
                productId: product.id,
                slug: product.slug,
              },
            });
            aliasesCreated += 1;
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2002"
            ) {
              aliasesSkipped += 1;
              canPreserveOldSlug = false;
            } else {
              throw error;
            }
          }
        } else if (existingAlias.productId !== product.id) {
          aliasesSkipped += 1;
          canPreserveOldSlug = false;
        }
      } else if (product.slug) {
        aliasesSkipped += 1;
        canPreserveOldSlug = false;
      }

      if (!canPreserveOldSlug) {
        skippedProducts += 1;
        skippedProductAliases.push({
          id: product.id,
          name: product.name,
          slug: product.slug,
          reason: "No fue posible reservar el alias de la URL actual",
        });
        return;
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
        updatedProducts: changesToApply.length - skippedProducts,
        skippedProducts,
        remainingProducts:
          changes.length - changesToApply.length + skippedProducts,
        aliasesCreated,
        aliasesSkipped,
        skippedProductAliases: skippedProductAliases.slice(0, 20),
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
