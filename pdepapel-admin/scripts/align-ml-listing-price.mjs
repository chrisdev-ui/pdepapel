/**
 * Alinea el precio de Mercado Libre guardado en el panel con el precio vivo
 * de Mercado Libre, solo en el panel: nunca escribe en Mercado Libre. El plan
 * (precio antes y después por publicación) vive fuera del repositorio,
 * porque trae cifras del negocio.
 *
 *   node --env-file=.env scripts/align-ml-listing-price.mjs <plan.json>
 *       ENSAYO: compara cada publicación con su «antes». No escribe.
 *   npm run prod:write -- scripts/align-ml-listing-price.mjs <plan.json> --apply --expect new
 *       Escribe en una transacción. Cada publicación se actualiza solo si
 *       todavía tiene exactamente el precio «antes»; si una no coincide, no se escribe nada.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const planPath = args.find((arg) => !arg.startsWith("--"));
if (!planPath) throw new Error("uso: <plan.json> [--apply]");
const plan = JSON.parse(readFileSync(planPath, "utf8"));

let db;
if (process.env.PROD_WRITE_APPROVED === "1") {
  const { createProdClient } = await import("./lib/prod-client.mjs");
  db = createProdClient();
} else {
  if (apply) throw new Error("--apply solo corre con `npm run prod:write -- scripts/align-ml-listing-price.mjs <plan.json> --apply --expect new`.");
  const require = createRequire(`${process.cwd()}/package.json`);
  const { PrismaClient } = require("@prisma/client");
  db = new PrismaClient();
}

try {
  const resolved = [];
  for (const row of plan) {
    const listing = await db.marketplaceListing.findFirst({
      where: { externalItemId: row.externalItemId },
      select: { id: true, marketplacePrice: true, lastSyncedPrice: true },
    });
    if (!listing) throw new Error(`${row.externalItemId}: no hay publicación vinculada`);
    const drift = Number(listing.marketplacePrice) !== Number(row.before);
    resolved.push({ ...row, id: listing.id, drift });
    console.log(`${row.externalItemId}: ${row.before} → ${row.after}${drift ? `  ¡DIFERENTE DEL PLAN (tiene ${listing.marketplacePrice})!` : ""}`);
  }
  if (resolved.some((row) => row.drift)) throw new Error("Alguna publicación cambió desde el plan. No se escribe nada.");
  if (!apply) {
    console.log("PROD_WRITE_ROWS=0");
  } else {
    const written = await db.$transaction(async (tx) => {
      let count = 0;
      for (const row of resolved) {
        const result = await tx.marketplaceListing.updateMany({
          where: { id: row.id, marketplacePrice: row.before },
          data: { marketplacePrice: row.after, lastSyncedPrice: row.after },
        });
        if (result.count !== 1) throw new Error(`${row.externalItemId} cambió durante la escritura. No se escribió nada.`);
        count += 1;
      }
      return count;
    });
    console.log(`PROD_WRITE_ROWS=${written}`);
  }
} finally {
  await db.$disconnect();
}
