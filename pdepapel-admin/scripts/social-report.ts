/**
 * Métricas de redes en la terminal, SOLO LECTURA con `pdepapel_ro`:
 *
 *   npm run social:report -- [--days 14] [--json]
 *
 * Lee la base (lo que guardó la sincronización); nunca llama a Meta ni a
 * TikTok. Imprime cuentas, seguidores y publicaciones de la ventana.
 */
import { PrismaClient } from "@prisma/client";

import { buildSocialSummary } from "@/lib/social/report";

import { assertReadOnlyUser } from "./lib/read-only-user";

const args = process.argv.slice(2);
const daysIndex = args.indexOf("--days");
const days = daysIndex >= 0 ? Number(args[daysIndex + 1]) : 14;
const asJson = args.includes("--json");

const fmt = (value: number | null | undefined) => (value == null ? "—" : value.toLocaleString("es-CO"));

async function main() {
  if (!Number.isFinite(days) || days <= 0) throw new Error("--days debe ser un número de días");
  const db = new PrismaClient();
  try {
    await assertReadOnlyUser(db);
    const stores = await db.socialAccount.findMany({ distinct: ["storeId"], select: { storeId: true } });
    for (const { storeId } of stores) {
      const summary = await buildSocialSummary(db, { storeId, days });
      if (asJson) {
        console.log(JSON.stringify(summary, null, 2));
        continue;
      }
      console.log(`\nÚltimos ${summary.days} días`);
      for (const account of summary.accounts) {
        const delta = account.followersDelta == null ? "" : ` (${account.followersDelta >= 0 ? "+" : ""}${fmt(account.followersDelta)})`;
        console.log(`  ${account.platform} @${account.username ?? "?"} · ${account.status}${account.statusReason ? ` (${account.statusReason})` : ""} · seguidores ${fmt(account.followers)}${delta} · último sync ${account.lastSyncAt ?? "nunca"}`);
      }
      console.log(`\n  ${summary.posts.length} publicaciones. Mediana de vistas: ${Object.entries(summary.medianViews).map(([p, v]) => `${p} ${fmt(v)}`).join(" · ") || "—"}`);
      const top = [...summary.posts].sort((a, b) => (b.views ?? -1) - (a.views ?? -1)).slice(0, 10);
      for (const post of top) {
        console.log(
          `  ${post.postedAt.slice(0, 10)} ${post.platform.padEnd(9)} ${String(post.productType ?? "").padEnd(8)} vistas ${fmt(post.views).padStart(8)} · 24 h ${fmt(post.views24h).padStart(7)} · ${post.multiplier ?? "—"}× · ER ${post.engagementRate ?? "—"} % · ${post.permalink ?? ""}`,
        );
      }
    }
    if (stores.length === 0) console.log("Todavía no hay cuentas conectadas.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
