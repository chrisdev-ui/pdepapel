import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SCHEDULED_JOBS } from "@/lib/scheduled-jobs";
import { parseSocialSyncMessage, SOCIAL_SYNC_PATH } from "@/lib/social/queue";

describe("cola y horario de la sincronización de redes", () => {
  it("solo acepta mensajes con cuenta y una continuación válida", () => {
    expect(parseSocialSyncMessage(JSON.stringify({ accountId: "a1" }))).toEqual({ accountId: "a1", continuation: null });
    expect(parseSocialSyncMessage(JSON.stringify({ accountId: "a1", continuation: { phase: "metrics", runStartedAt: "2026-10-21T00:00:00Z" } }))?.continuation?.phase).toBe("metrics");
    for (const body of ["no json", "{}", JSON.stringify({ accountId: "a1", continuation: { phase: "borrar", runStartedAt: "2026-10-21" } }), JSON.stringify({ accountId: "a1", continuation: { phase: "list", runStartedAt: "nunca" } })]) {
      expect(parseSocialSyncMessage(body), body).toBeNull();
    }
    expect(SOCIAL_SYNC_PATH).toBe("/api/internal/social/sync");
  });

  it("encendida: el cron de Vercel corre cada 6 h; el workflow queda solo a mano y simula por defecto", () => {
    expect(SCHEDULED_JOBS["social-sync"].enabled).toBe(true);
    const vercel = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
    // Sin consulta en la ruta: Vercel no promete conservarla; el apply sale del encabezado del cron.
    expect(vercel.crons).toContainEqual({ path: "/api/cron/social-sync", schedule: "15 3,9,15,21 * * *" });
    const workflow = readFileSync(path.resolve(__dirname, "../../../../../.github/workflows/social-sync.yml"), "utf8");
    expect(workflow).not.toMatch(/^\s*schedule:/m);
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("MODE: ${{ github.event.inputs.mode || 'dry-run' }}");
    expect(workflow).toMatch(/mode:\n\s+description: [^\n]+\n\s+required: false\n\s+default: dry-run/);
    expect(workflow).toContain("secrets.PDEPAPEL_ADMIN_CRON_SECRET");
    expect(workflow).toContain("/api/cron/social-sync?platform=$PLATFORM&mode=$MODE");
    expect(workflow).not.toMatch(/META_IG_PAGE_TOKEN|TIKTOK_CLIENT/);
  });
});
