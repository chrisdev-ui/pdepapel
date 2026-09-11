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
