import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { format } from "prettier";

import { findArchivedProductRedirect, type ArchivedProductRedirect } from "../lib/archived-product-redirect";
import { collapseProductRedirects, restoreArchivedSources } from "../lib/product-slug-redirects";
import { assertReadOnlyUser } from "./lib/read-only-user";

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

  await assertReadOnlyUser(prismadb);

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
  // Un origen cuyo producto final quedó archivado va directo a donde lo
  // mandaría la ficha (hermana viva, categoría, tipo o tienda), en un salto.
  const archivedTargets = new Map<string, ArchivedProductRedirect | null>();
  const productSlug = (path: string) => path.replace(/^\/producto\//, "").replace(/#.*$/, "");
  for (const entry of report.dropped) {
    if (entry.reason !== "destino-archivado-o-inexistente") continue;
    const fromDestination = entry.destination.startsWith("/producto/")
      ? await findArchivedProductRedirect(prismadb, storeId, productSlug(entry.destination))
      : null;
    archivedTargets.set(
      entry.source,
      fromDestination ?? (await findArchivedProductRedirect(prismadb, storeId, productSlug(entry.source))),
    );
  }
  const restoredReport = restoreArchivedSources(report, archivedTargets);
  const redirects = restoredReport.redirects;
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
        restoredToArchivedTarget: restoredReport.restored,
        dropped: restoredReport.stillDropped.length,
        droppedBecauseSourceIsLive: restoredReport.stillDropped.filter((entry) => entry.reason === "origen-es-producto-vivo").length,
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
