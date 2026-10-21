/**
 * Dispara la sincronización de redes, opción (b): este guion nunca llama a
 * Meta ni a TikTok desde tu máquina.
 *
 *   npm run social:sync -- [--platform all|instagram|tiktok] [--apply]
 *       Corre el workflow `social-sync.yml` en GitHub (gh workflow run). Sin
 *       --apply, el workflow solo cuenta; con --apply encola la sincronización
 *       real (solo cuando el trabajo está encendido en lib/scheduled-jobs.ts).
 *   npm run social:sync -- --dry-run [--platform …]
 *       Local y SOLO LECTURA con `pdepapel_ro`: cuentas, estado y cuántas
 *       publicaciones tocaría la próxima corrida.
 */
import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

import { shouldPollPost } from "@/lib/social/metrics";

import { assertReadOnlyUser } from "./lib/read-only-user";

const REPO = "chrisdev-ui/pdepapel";
const args = process.argv.slice(2);
const platformIndex = args.indexOf("--platform");
const platform = platformIndex >= 0 ? args[platformIndex + 1] : "all";
if (!["all", "instagram", "tiktok"].includes(platform)) {
  console.error("--platform debe ser all, instagram o tiktok");
  process.exit(2);
}

async function dryRun() {
  const db = new PrismaClient();
  try {
    await assertReadOnlyUser(db);
    const accounts = await db.socialAccount.findMany({
      where: platform === "all" ? {} : { platform: platform === "instagram" ? "INSTAGRAM" : "TIKTOK" },
      select: { platform: true, status: true, statusReason: true, lastSyncAt: true, posts: { select: { postedAt: true, metricsSyncedAt: true } } },
    });
    const now = new Date();
    if (accounts.length === 0) console.log("No hay cuentas conectadas.");
    for (const account of accounts) {
      const due = account.posts.filter((post) => shouldPollPost(post, now)).length;
      console.log(`${account.platform}: ${account.status}${account.statusReason ? ` (${account.statusReason})` : ""} · ${account.posts.length} publicaciones · ${due} tocarían ahora · último sync ${account.lastSyncAt?.toISOString() ?? "nunca"}`);
    }
  } finally {
    await db.$disconnect();
  }
}

if (args.includes("--dry-run")) {
  dryRun().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
} else {
  const mode = args.includes("--apply") ? "apply" : "dry-run";
  execFileSync("gh", ["workflow", "run", "social-sync.yml", "--repo", REPO, "-f", `platform=${platform}`, "-f", `mode=${mode}`], { stdio: "inherit" });
  console.log(`Workflow social-sync.yml lanzado (platform=${platform}, mode=${mode}). Míralo con: gh run list --workflow social-sync.yml --repo ${REPO}`);
}
