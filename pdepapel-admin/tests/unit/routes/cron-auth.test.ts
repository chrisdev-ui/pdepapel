import fs from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Una llamada sin el secreto del cron no debe escribir en JobRun: antes un
 * GET anónimo dejaba la tarea en rojo en «Sistemas» y pisaba la última
 * corrida real. La revisión estática atrapa la próxima ruta que se agregue.
 */
const mocks = vi.hoisted(() => ({ record: vi.fn() }));

vi.mock("@/lib/env.mjs", () => ({ env: { CRON_SECRET: "cron-secret" } }));
vi.mock("@/lib/job-runs", () => ({ recordJobRun: mocks.record }));
vi.mock("@/lib/prismadb", () => ({
  default: new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === "then") return undefined;
        throw new Error(`prismadb.${String(key)} no debe usarse sin autenticar`);
      },
    },
  ),
}));
vi.mock("@/lib/newsletter-retention", () => ({ deleteExpiredPendingNewsletterSignups: vi.fn() }));
vi.mock("@/lib/mercadolibre/health-job", () => ({ runMercadoLibreHealthJob: vi.fn() }));
vi.mock("@/lib/whatsapp/recovery", () => ({ sweepWhatsAppEvents: vi.fn() }));
vi.mock("@/lib/whatsapp/webhook-volume", () => ({
  countTodayWebhookEvents: vi.fn(),
  findTopContactToday: vi.fn(),
  judgeWebhookVolume: vi.fn(),
  resolveVolumeThreshold: vi.fn(),
}));
vi.mock("@/lib/payment-webhook-retention", () => ({ pruneSettledPaymentWebhookEvents: vi.fn() }));

import { isCronRequest } from "@/lib/cron-auth";
import { GET as mercadolibreHealth } from "@/app/api/cron/mercadolibre-health/route";
import { GET as newsletterRetention } from "@/app/api/cron/newsletter-retention/route";
import { GET as paymentWebhookRetention } from "@/app/api/cron/payment-webhook-retention/route";
import { GET as updateCoupons } from "@/app/api/cron/update-coupons/route";
import { GET as whatsappRecovery } from "@/app/api/cron/whatsapp-recovery/route";
import { GET as whatsappWebhookVolume } from "@/app/api/cron/whatsapp-webhook-volume/route";

const CRON_DIR = path.join(process.cwd(), "app/api/cron");
const cronRoutes = fs
  .readdirSync(CRON_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(CRON_DIR, entry.name, "route.ts")))
  .map((entry) => ({ name: entry.name, source: fs.readFileSync(path.join(CRON_DIR, entry.name, "route.ts"), "utf8") }));

const request = (headers: Record<string, string> = {}) =>
  new NextRequest("https://admin.test/api/cron/x", { headers });

describe("autenticación de los crons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("encuentra las rutas de cron", () => {
    expect(cronRoutes.length).toBeGreaterThanOrEqual(19);
  });

  it.each(cronRoutes)("$name autentica con requireCronAuth antes del try y de cualquier JobRun", ({ source }) => {
    const handler = source.search(/export async function GET\(/);
    expect(handler).toBeGreaterThanOrEqual(0);
    const body = source.slice(handler);
    const auth = body.search(/const denied = requireCronAuth\((request|req)[,)][^\n]*\n\s*if \(denied\) return denied;/);
    expect(auth).toBeGreaterThanOrEqual(0);
    const firstTry = body.search(/\btry \{/);
    const firstRecord = body.search(/\brecordJobRun\(/);
    if (firstTry >= 0) expect(auth).toBeLessThan(firstTry);
    if (firstRecord >= 0) expect(auth).toBeLessThan(firstRecord);
    expect(source).not.toMatch(/=== env\.CRON_SECRET|!== env\.CRON_SECRET/);
  });

  const handlers = [
    { name: "mercadolibre-health", handler: mercadolibreHealth },
    { name: "newsletter-retention", handler: newsletterRetention },
    { name: "payment-webhook-retention", handler: paymentWebhookRetention },
    { name: "update-coupons", handler: updateCoupons },
    { name: "whatsapp-recovery", handler: whatsappRecovery },
    { name: "whatsapp-webhook-volume", handler: whatsappWebhookVolume },
  ];

  it.each(handlers)("$name sin el secreto responde 403 y no toca JobRun", async ({ handler }) => {
    const attempts: Record<string, string>[] = [
      {},
      { authorization: "Bearer otro" },
      { authorization: "Bearer " },
      { "x-vercel-cron-schedule": "0 13 * * *" },
    ];
    for (const headers of attempts) {
      const response = await handler(request(headers));
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("isCronRequest solo acepta el Bearer exacto", () => {
    expect(isCronRequest(request({ authorization: "Bearer cron-secret" }))).toBe(true);
    expect(isCronRequest(request({ authorization: "Bearer cron-secret2" }))).toBe(false);
    expect(isCronRequest(request({ authorization: "cron-secret" }))).toBe(false);
    expect(isCronRequest(request())).toBe(false);
  });
});
