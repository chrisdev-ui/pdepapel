/**
 * Marcado de los grupos existentes (#13): `scope` en las fotos de grupo y
 * `origin` en las de variante, en una transacción.
 *
 * Ensayo (no escribe; vale con pdepapel_ro):
 *   node --env-file=.env node_modules/.bin/tsx scripts/backfill-image-origin.ts [--out archivo.json]
 * Escritura (después de la revisión de Christian, con su token):
 *   npm run prod:write -- scripts/backfill-image-origin.ts --apply --expect new
 *
 * Una foto de variante es copia del grupo solo si: su URL es la de una foto
 * del grupo, el alcance reconstruido de esa foto le toca a la variante y no
 * es por descarte, y otra variante también la tiene. Todo lo demás es propia.
 * Las copias marcadas pasan a ser las filas más nuevas de su variante, que es
 * lo que mantiene el orden de las galerías. La reconstrucción es la del
 * formulario del grupo (`reconstructMapping`).
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { scopeAppliesTo } from "@/lib/variant-images";

import { createProdClient } from "./lib/prod-client.mjs";

type Product = { id: string; name: string; colorId: string | null; designId: string | null; images: Row[] };
type Row = { id: string; url: string; isMain: boolean; createdAt: Date; origin: string | null };
type Rebuilt = { scope: string; clear: boolean; reason?: string };

function rebuildScope(url: string, products: Product[]): Rebuilt {
  const has = products.filter((p) => p.images.some((image) => image.url === url));
  if (has.length === 0) return { scope: "all", clear: false, reason: "ninguna variante la tiene" };
  if (has.length === products.length) return { scope: "all", clear: true };
  const exact = (match: (p: Product) => boolean) => {
    const group = products.filter(match);
    return has.length === group.length && has.every(match);
  };
  const combos = new Set(products.filter((p) => p.colorId && p.designId).map((p) => `${p.colorId}|${p.designId}`));
  for (const combo of Array.from(combos)) {
    const [c, d] = combo.split("|");
    if (exact((p) => p.colorId === c && p.designId === d)) return { scope: `COMBO|${c}|${d}`, clear: true };
  }
  for (const c of Array.from(new Set(products.map((p) => p.colorId).filter(Boolean)))) {
    if (exact((p) => p.colorId === c)) return { scope: c as string, clear: true };
  }
  for (const d of Array.from(new Set(products.map((p) => p.designId).filter(Boolean)))) {
    if (exact((p) => p.designId === d)) return { scope: d as string, clear: true };
  }
  return { scope: "all", clear: false, reason: "la tienen algunas variantes sin coincidir con un color, diseño o combinación" };
}

const visibleOrder = (rows: Row[]) =>
  [...rows].sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const outIndex = args.indexOf("--out");
  const outFile = outIndex >= 0 ? args[outIndex + 1] : null;
  const viaProdWrite = process.env.PROD_WRITE_APPROVED === "1";
  if (apply && !viaProdWrite) throw new Error("--apply solo corre con `npm run prod:write -- scripts/backfill-image-origin.ts --apply --expect new`.");
  if (viaProdWrite && process.env.PROD_WRITE_EXPECT !== "new") throw new Error("este guion solo escribe en la base nueva (--expect new).");

  const base = new PrismaClient();
  const db = viaProdWrite ? (createProdClient({ client: base }) as unknown as PrismaClient) : base;
  try {
    const already = await db.image.count({ where: { OR: [{ origin: { not: null } }, { scope: { not: null } }] } });
    const groups = await db.productGroup.findMany({
      select: {
        id: true,
        name: true,
        images: { select: { id: true, url: true, scope: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        products: {
          select: {
            id: true,
            name: true,
            colorId: true,
            designId: true,
            images: { select: { id: true, url: true, isMain: true, createdAt: true, origin: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const groupScopes: { id: string; group: string; url: string; before: string | null; after: string }[] = [];
    const originChanges: { id: string; productId: string; after: "OWN" | "GROUP_COPY" }[] = [];
    const dateChanges: { id: string; productId: string; before: string; after: string }[] = [];
    const ambiguous: { group: string; variant: string; url: string; reason: string }[] = [];
    const previews: { group: string; variant: string; antes: string[]; despues: string[] }[] = [];
    const perGroup: { group: string; variantes: number; copias: number; propias: number; ambiguas: number; fotosGrupoSinAlcanceClaro: number }[] = [];
    const short = (url: string) => url.split("/").pop()!.slice(0, 22);

    const skipped: string[] = [];
    for (const group of groups) {
      // Guardado ya con el código nuevo: su reparto está guardado y no se adivina.
      if (group.images.some((image) => image.scope !== null)) {
        skipped.push(group.name);
        continue;
      }
      const products = group.products as Product[];
      const rebuilt = new Map(group.images.map((image) => [image.url, rebuildScope(image.url, products)]));
      let copies = 0;
      let own = 0;
      let amb = 0;
      let unclear = 0;
      for (const image of group.images) {
        const r = rebuilt.get(image.url)!;
        if (!r.clear) {
          unclear += 1;
          continue;
        }
        if (image.scope !== r.scope) groupScopes.push({ id: image.id, group: group.name, url: image.url, before: image.scope, after: r.scope });
      }
      for (const product of products) {
        const marks = new Map<string, "OWN" | "GROUP_COPY">();
        for (const row of product.images) {
          if (row.origin) continue;
          const r = rebuilt.get(row.url);
          let reason: string | null = null;
          if (!r) reason = null;
          else if (!r.clear) reason = `alcance sin aclarar: ${r.reason}`;
          else if (!scopeAppliesTo(r.scope, product.colorId, product.designId)) reason = "el alcance reconstruido no le toca";
          else if (!products.some((other) => other.id !== product.id && other.images.some((image) => image.url === row.url))) reason = "solo esta variante la tiene";
          const isCopy = r !== undefined && reason === null;
          marks.set(row.id, isCopy ? "GROUP_COPY" : "OWN");
          originChanges.push({ id: row.id, productId: product.id, after: isCopy ? "GROUP_COPY" : "OWN" });
          if (isCopy) copies += 1;
          else {
            own += 1;
            if (r && reason) {
              amb += 1;
              ambiguous.push({ group: group.name, variant: product.name, url: row.url, reason });
            }
          }
        }
        const copyRows = product.images.filter((row) => (marks.get(row.id) ?? row.origin) === "GROUP_COPY");
        const ownRows = product.images.filter((row) => (marks.get(row.id) ?? row.origin) !== "GROUP_COPY");
        if (copyRows.length === 0 || ownRows.length === 0) continue;
        const newestOwn = Math.max(...ownRows.map((row) => row.createdAt.getTime()));
        const ordered = [...copyRows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
        if (ordered[0].createdAt.getTime() > newestOwn) continue;
        const moved = new Map<string, Date>();
        ordered.forEach((row, index) => {
          const after = new Date(newestOwn + 1 + index);
          moved.set(row.id, after);
          dateChanges.push({ id: row.id, productId: product.id, before: row.createdAt.toISOString(), after: after.toISOString() });
        });
        if (previews.length < 5) {
          const afterRows = product.images.map((row) => ({ ...row, createdAt: moved.get(row.id) ?? row.createdAt }));
          const label = (row: Row) => `${row.isMain ? "★" : ""}${short(row.url)}${(marks.get(row.id) ?? row.origin) === "GROUP_COPY" ? " (grupo)" : ""}`;
          previews.push({ group: group.name, variant: product.name, antes: visibleOrder(product.images).map(label), despues: visibleOrder(afterRows).map(label) });
        }
      }
      perGroup.push({ group: group.name, variantes: products.length, copias: copies, propias: own, ambiguas: amb, fotosGrupoSinAlcanceClaro: unclear });
    }

    const totals = perGroup.reduce(
      (t, g) => ({ grupos: t.grupos + 1, copias: t.copias + g.copias, propias: t.propias + g.propias, ambiguas: t.ambiguas + g.ambiguas, fotosGrupoSinAlcanceClaro: t.fotosGrupoSinAlcanceClaro + g.fotosGrupoSinAlcanceClaro }),
      { grupos: 0, copias: 0, propias: 0, ambiguas: 0, fotosGrupoSinAlcanceClaro: 0 },
    );
    const report = { modo: apply ? "APLICAR" : "ENSAYO", filasYaMarcadas: already, gruposYaGuardadosConCodigoNuevo: skipped, totales: { ...totals, alcancesDeGrupo: groupScopes.length, cambiosDeFecha: dateChanges.length }, porGrupo: perGroup, ambiguas: ambiguous, cambiosDeFecha: dateChanges, alcancesDeGrupo: groupScopes, vistaPrevia: previews };
    if (outFile) writeFileSync(outFile, JSON.stringify(report, null, 1));
    console.log(JSON.stringify({ ...report, ambiguas: ambiguous.length, cambiosDeFecha: dateChanges.length, alcancesDeGrupo: groupScopes.length }, null, 1));

    if (!apply) {
      console.log("PROD_WRITE_ROWS=0");
      return;
    }

    const at = new Date().toISOString();
    const undo = [
      `UPDATE \`Image\` SET \`origin\` = NULL WHERE \`id\` IN (${originChanges.map((c) => `'${c.id}'`).join(", ") || "''"});`,
      `UPDATE \`Image\` SET \`scope\` = NULL WHERE \`id\` IN (${groupScopes.map((c) => `'${c.id}'`).join(", ") || "''"});`,
      ...dateChanges.map((c) => `UPDATE \`Image\` SET \`createdAt\` = '${c.before.replace("T", " ").replace("Z", "")}' WHERE \`id\` = '${c.id}';`),
    ];
    appendFileSync(
      resolve(process.cwd(), "ops/prod-writes.log"),
      [`# ${at} backfill-image-origin ANTES ${JSON.stringify({ dateChanges, groupScopes: groupScopes.map(({ id, before }) => ({ id, before })) })}`, ...undo.map((u) => `# ${at} backfill-image-origin DESHACER ${u}`), ""].join("\n"),
    );
    const written = await db.$transaction(
      async (tx) => {
        let rows = 0;
        for (const kind of ["OWN", "GROUP_COPY"] as const) {
          const ids = originChanges.filter((c) => c.after === kind).map((c) => c.id);
          if (ids.length) rows += (await tx.image.updateMany({ where: { id: { in: ids }, origin: null }, data: { origin: kind } })).count;
        }
        // Una consulta por valor de alcance: fila por fila no cabe en el tiempo de la transacción.
        const byScope = new Map<string, string[]>();
        for (const change of groupScopes) byScope.set(change.after, [...(byScope.get(change.after) ?? []), change.id]);
        for (const [scope, ids] of Array.from(byScope)) {
          rows += (await tx.image.updateMany({ where: { id: { in: ids }, scope: null }, data: { scope } })).count;
        }
        for (const change of dateChanges) {
          await tx.image.update({ where: { id: change.id }, data: { createdAt: new Date(change.after) } });
          rows += 1;
        }
        return rows;
      },
      { timeout: 600_000, maxWait: 30_000 },
    );
    console.log(`\nAplicado: ${written} cambios.`);
    console.log(`PROD_WRITE_ROWS=${written}`);
  } finally {
    await base.$disconnect();
  }
}

main().catch((error) => {
  console.error(`backfill-image-origin: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
