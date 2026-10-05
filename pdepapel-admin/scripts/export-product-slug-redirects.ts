import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { format } from "prettier";

import { collapseProductRedirects } from "../lib/product-slug-redirects";

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
  redirects: Array<{ source: string; destination: string }>,
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

  // Solo lectura: alias y productos (vivos y archivados) del catálogo actual.
  const [aliases, products] = await Promise.all([
    prismadb.productSlugAlias.findMany({
      where: { storeId },
      select: { slug: true, productId: true },
    }),
    prismadb.product.findMany({
      where: { storeId },
      select: { id: true, slug: true, isArchived: true },
    }),
  ]);
  // El mapa vigente es entrada: sus orígenes (URL que Google aún conoce) se
  // conservan y su destino se recalcula hasta el producto vivo final.
  let legacy: Array<{ source: string; destination: string }> = [];
  try {
    legacy = (await import(pathToFileURL(outputPath).href)).legacyProductRedirects;
  } catch {
    legacy = [];
  }
  const report = collapseProductRedirects({ legacy, aliases, products });
  const redirects = report.redirects;
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
        legacyRead: legacy.length,
        redirectsWritten: redirects.length,
        kept: report.kept,
        collapsed: report.collapsed.length,
        dropped: report.dropped.length,
        droppedBecauseSourceIsLive: report.dropped.filter((entry) => entry.reason === "origen-es-producto-vivo").length,
        added: report.added,
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
