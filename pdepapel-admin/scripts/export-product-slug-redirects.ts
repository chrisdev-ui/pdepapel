import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { format } from "prettier";

import { buildProductSlugRedirects } from "../lib/product-slug-redirects";

const prismadb = new PrismaClient();
const storeIdArgument = process.argv.find((argument) =>
  argument.startsWith("--store-id="),
);
const storeId = storeIdArgument?.split("=")[1];
const outputPath = fileURLToPath(
  new URL(
    "../../pdepapel-store/lib/legacy-product-redirects.mjs",
    import.meta.url,
  ),
);

async function buildModuleSource(
  redirects: ReturnType<typeof buildProductSlugRedirects>,
) {
  const entries = redirects
    .map(
      ({ source, destination }) => `  {
    source: ${JSON.stringify(source)},
    destination: ${JSON.stringify(destination)},
  },`,
    )
    .join("\n");

  return format(`export const legacyProductRedirects = [\n${entries}\n];\n`, {
    parser: "babel",
  });
}

async function main() {
  if (!storeId) {
    throw new Error("Provide the public store with --store-id=<store-id>.");
  }

  const [aliases, products] = await Promise.all([
    prismadb.productSlugAlias.findMany({
      where: {
        storeId,
        product: { isArchived: false },
      },
      select: {
        slug: true,
        product: { select: { slug: true } },
      },
    }),
    prismadb.product.findMany({
      where: { storeId },
      select: { slug: true },
    }),
  ]);
  const redirects = buildProductSlugRedirects(
    aliases,
    products.map((product) => product.slug),
  );
  const nextContents = await buildModuleSource(redirects);

  let previousContents: string | null = null;
  try {
    previousContents = await readFile(outputPath, "utf8");
  } catch {
    previousContents = null;
  }

  if (previousContents !== nextContents) {
    await writeFile(outputPath, nextContents, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        storeId,
        aliasesRead: aliases.length,
        redirectsWritten: redirects.length,
        changed: previousContents !== nextContents,
        outputPath,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("Product slug redirect export failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prismadb.$disconnect();
  });
