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

describe("métricas de redes en «Sistemas»: una fila por red", () => {
  const now = new Date("2026-10-21T12:00:00.000Z");
  const run = (name: string, hoursAgo: number, ok: boolean, detail: string) => ({ name, storeId: "store-1", ranAt: new Date(now.getTime() - hoursAgo * 3_600_000), ok, detail });

  it("cada red con su última corrida; el fallo de una no lo tapa el éxito de la otra", () => {
    const rows = buildSystemsStatus([run("social-sync-instagram", 3, false, "Falló (meta_10)"), run("social-sync-tiktok", 1, true, "91 publicaciones revisadas, 91 mediciones")], "store-1", now);
    expect(rows.find((row) => row.name === "social-sync-instagram")).toMatchObject({ label: "Métricas de Instagram", ok: false, attention: true, detail: "Falló (meta_10)" });
    expect(rows.find((row) => row.name === "social-sync-tiktok")).toMatchObject({ label: "Métricas de TikTok", ok: true, attention: false });
  });

  it("las filas de redes dejan ver el detalle también cuando salen bien (cuántas se midieron); las demás no", () => {
    const rows = buildSystemsStatus([run("social-recent", 0.5, true, "3 publicaciones medidas"), run("update-offers", 1, true, "ok")].map((item) => ({ ...item, storeId: item.name === "social-recent" ? null : item.storeId })), "store-1", now);
    expect(rows.find((row) => row.name === "social-recent")).toMatchObject({ ok: true, showDetail: true, detail: "3 publicaciones medidas" });
    expect(rows.filter((row) => row.showDetail).map((row) => row.name).sort()).toEqual(["social-recent", "social-sync-instagram", "social-sync-tiktok"]);
  });

  it("una red sin cuenta en la tienda no aparece", () => {
    const rows = buildSystemsStatus([], "store-1", now, ["social-sync-tiktok"]);
    expect(rows.some((row) => row.name === "social-sync-tiktok")).toBe(false);
    expect(rows.find((row) => row.name === "social-sync-instagram")).toMatchObject({ overdue: true, attention: true });
  });
});
