import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/job-runs", () => ({ recordJobRun: vi.fn() }));
vi.mock("@/lib/mercadolibre/health-cron", () => ({ processMercadoLibreHealthChecks: vi.fn() }));

import { healthJobDetail } from "@/lib/mercadolibre/health-job";

const applied = (extra: Record<string, number> = {}) => ({ stockResync: 0, statusUpdates: 0, userProductBackfill: 0, priceMirrored: 0, typeRefreshed: 0, siteFallback: 0, ...extra });

describe("línea de Sistemas de la revisión diaria de Mercado Libre", () => {
  it("sin cambios de tipo ni sitio, la misma línea de antes", () => {
    expect(healthJobDetail({ processed: [{ connectionId: "c", issues: 0, notified: 0, reconcile: "ok", applied: applied() }], failed: 0 }).detail).toBe("1 conexión revisada");
  });

  it("cuenta las publicaciones puestas al día y el sitio que faltó, sin nombrarlas", () => {
    const result = healthJobDetail({
      processed: [
        { connectionId: "a", issues: 0, notified: 0, reconcile: "ok", applied: applied({ typeRefreshed: 3, siteFallback: 1 }) },
        { connectionId: "b", issues: 0, notified: 0, reconcile: "reauth" },
      ],
      failed: 0,
    });
    expect(result).toEqual({ incomplete: 1, detail: "2 conexiones revisadas, 1 sin revisar contra Mercado Libre, 3 publicaciones con tipo o categoría al día, 1 conexión sin sitio: se usó MCO" });
  });
});
