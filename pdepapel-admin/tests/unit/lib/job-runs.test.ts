import { describe, expect, it } from "vitest";

import { buildSystemsStatus, JOB_DEFINITIONS } from "@/lib/job-runs";

describe("systems status", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");
  const hours = (n: number) => new Date(now.getTime() - n * 60 * 60 * 1000);

  it("lists every job, marking failures and overdue runs as needing attention", () => {
    const rows = buildSystemsStatus(
      [
        {
          name: "update-offers",
          storeId: null,
          ranAt: hours(3),
          ok: true,
          detail: "2 vencidas",
        },
        {
          name: "update-coupons",
          storeId: null,
          ranAt: hours(60),
          ok: true,
          detail: null,
        },
        {
          name: "google-merchant-feed",
          storeId: "s1",
          ranAt: hours(2),
          ok: false,
          detail: "timeout",
        },
        {
          name: "google-merchant-feed",
          storeId: "s2",
          ranAt: hours(2),
          ok: true,
          detail: null,
        },
      ],
      "s1",
      now,
    );
    expect(rows.map((row) => row.name)).toEqual(
      JOB_DEFINITIONS.map((job) => job.name),
    );
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
    expect(byName["update-offers"]).toMatchObject({
      ok: true,
      overdue: false,
      attention: false,
    });
    expect(byName["update-coupons"]).toMatchObject({
      ok: true,
      overdue: true,
      attention: true,
    });
    expect(byName["google-merchant-feed"]).toMatchObject({
      ok: false,
      overdue: false,
      attention: true,
      detail: "timeout",
    });
    expect(byName["image-health"]).toMatchObject({
      ranAt: null,
      ok: null,
      overdue: true,
      attention: true,
    });
  });

  it("does not let another store's per-store run count for this store", () => {
    const rows = buildSystemsStatus(
      [
        {
          name: "image-health",
          storeId: "other",
          ranAt: hours(1),
          ok: true,
          detail: null,
        },
      ],
      "s1",
      now,
    );
    expect(rows.find((row) => row.name === "image-health")).toMatchObject({
      ranAt: null,
      overdue: true,
    });
  });
});

describe("métricas de redes en «Sistemas»", () => {
  it("sin cuentas conectadas no aparece; con cuentas, sin corrida reciente, pide atención", () => {
    const now = new Date("2026-10-21T12:00:00.000Z");
    expect(buildSystemsStatus([], "store-1", now, ["social-sync"]).some((row) => row.name === "social-sync")).toBe(false);
    const row = buildSystemsStatus([], "store-1", now).find((candidate) => candidate.name === "social-sync");
    expect(row).toMatchObject({ label: "Métricas de redes", overdue: true, attention: true });
    const fresh = buildSystemsStatus([{ name: "social-sync", storeId: "store-1", ranAt: new Date("2026-10-21T09:00:00.000Z"), ok: true, detail: "Instagram: 3 publicaciones revisadas, 3 mediciones" }], "store-1", now).find((candidate) => candidate.name === "social-sync");
    expect(fresh).toMatchObject({ overdue: false, attention: false });
  });
});
