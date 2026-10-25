import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { DAILY_OVERDUE_HOURS, JOB_DEFINITIONS, overdueAfterHours } from "@/lib/job-runs";
import { scheduledRequestUrl } from "@/lib/scheduled-jobs";

/**
 * Los trabajos diarios corren como crons de Vercel (13:00–13:22 UTC, de dos en
 * dos minutos, el feed de Merchant primero): GitHub los arrancaba de 3 a 8,5 h
 * tarde y se saltaba franjas del conteo de WhatsApp. Los workflows quedan solo
 * a mano; si alguno vuelve a tener horario, el trabajo corre dos veces.
 */
const root = path.resolve(__dirname, "../../..");
const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
const workflow = (name: string) => readFileSync(path.join(root, "..", ".github/workflows", name), "utf8");

const DAILY = [
  ["/api/cron/google-merchant-feed", "0 13 * * *"],
  ["/api/cron/image-health", "2 13 * * *"],
  ["/api/cron/notification-retry", "4 13 * * *"],
  ["/api/cron/db-health", "6 13 * * *"],
  ["/api/cron/gift-card-holds", "8 13 * * *"],
  ["/api/cron/bank-transfer-review", "10 13 * * *"],
  ["/api/cron/abc-classification", "12 13 * * *"],
  ["/api/cron/whatsapp-recovery", "14 13 * * *"],
  ["/api/cron/whatsapp-webhook-retention", "16 13 * * *"],
  ["/api/cron/payment-webhook-retention", "18 13 * * *"],
  ["/api/cron/copilot-retention", "20 13 * * *"],
  ["/api/cron/newsletter-retention", "22 13 * * *"],
] as const;

describe("crons de Vercel en lugar de los horarios de GitHub", () => {
  it("cada trabajo diario tiene su entrada, escalonada y con el feed de Merchant primero", () => {
    for (const [cronPath, schedule] of DAILY) expect(vercel.crons).toContainEqual({ path: cronPath, schedule });
    expect(vercel.crons).toContainEqual({ path: "/api/cron/whatsapp-webhook-volume", schedule: "0 2,14,18,22 * * *" });
    const minutes = DAILY.map(([, schedule]) => Number(schedule.split(" ")[0]));
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    expect(new Set(minutes).size).toBe(minutes.length);
    expect(DAILY[0][0]).toBe("/api/cron/google-merchant-feed");
  });

  it("ninguna entrada lleva consulta, ninguna se repite y cada una apunta a una ruta GET que existe", () => {
    const paths = vercel.crons.map((cron) => cron.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const cronPath of paths) {
      expect(cronPath).not.toContain("?");
      const route = path.join(root, "app", cronPath, "route.ts");
      expect(existsSync(route), cronPath).toBe(true);
      expect(readFileSync(route, "utf8")).toMatch(/export async function GET/);
    }
    expect(paths).not.toContain("/api/cron/customer-reactivation");
    expect(paths).not.toContain("/api/cron/mercadolibre-health");
  });

  it("la conciliación de pagos corre cada hora a las :35, sin chocar con las otras horarias, y Sistemas la marca atrasada a las 2 h", () => {
    expect(vercel.crons).toContainEqual({ path: "/api/cron/payment-reconciliation", schedule: "35 * * * *" });
    const hourlyMinutes = vercel.crons.filter((cron) => / \* \* \* \*$/.test(cron.schedule)).map((cron) => cron.schedule.split(" ")[0]);
    expect(new Set(hourlyMinutes).size).toBe(hourlyMinutes.length);
    const job = JOB_DEFINITIONS.find((definition) => definition.name === "payment-reconciliation")!;
    expect(job).toMatchObject({ expectedEveryHours: 1, perStore: false });
    expect(overdueAfterHours(job)).toBe(2);
  });

  it.each(["admin-scheduled-tasks.yml", "whatsapp-volume-watch.yml"])("%s queda solo a mano, sin horario", (name) => {
    const text = workflow(name);
    expect(text).not.toMatch(/^\s*schedule:/m);
    expect(text).not.toMatch(/^\s*-\s*cron:/m);
    expect(text).toContain("workflow_dispatch:");
  });

  it("Sistemas: el conteo de WhatsApp se espera cada 6 h; los diarios, cada 24 h y atrasados a las 26 h (Vercel no reintenta)", () => {
    const job = (name: string) => JOB_DEFINITIONS.find((definition) => definition.name === name)!;
    expect(job("whatsapp-webhook-volume").expectedEveryHours).toBe(6);
    expect(overdueAfterHours(job("whatsapp-webhook-volume"))).toBe(12);
    expect(DAILY_OVERDUE_HOURS).toBe(26);
    for (const [cronPath] of DAILY) {
      const name = cronPath.replace("/api/cron/", "");
      expect(job(name).expectedEveryHours, name).toBe(24);
      expect(overdueAfterHours(job(name)), name).toBe(26);
    }
    for (const definition of JOB_DEFINITIONS.filter((candidate) => candidate.expectedEveryHours === 24)) {
      expect(overdueAfterHours(definition), definition.name).toBe(26);
    }
  });

  it("el encabezado del cron pide la corrida en serio; un mode explícito o una llamada sin encabezado no cambian", () => {
    const cron = { "x-vercel-cron-schedule": "0 13 * * *" };
    expect(new URL(scheduledRequestUrl(new Request("https://a.test/api/cron/x", { headers: cron }))).searchParams.get("mode")).toBe("apply");
    expect(new URL(scheduledRequestUrl(new Request("https://a.test/api/cron/x?mode=dry-run", { headers: cron }))).searchParams.get("mode")).toBe("dry-run");
    expect(new URL(scheduledRequestUrl(new Request("https://a.test/api/cron/x"))).searchParams.has("mode")).toBe(false);
  });
});
