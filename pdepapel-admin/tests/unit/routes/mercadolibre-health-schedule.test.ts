import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), job: vi.fn() }));

vi.mock("@/lib/mercadolibre/queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mercadolibre/queue")>()),
  verifyMercadoLibreProcessorRequest: mocks.verify,
}));
vi.mock("@/lib/mercadolibre/health-job", () => ({ runMercadoLibreHealthJob: mocks.job }));

import { POST } from "@/app/api/internal/marketplaces/mercadolibre/health/route";

describe("revisión diaria desde QStash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.job.mockResolvedValue({ processed: [], failed: 0 });
  });

  it("sin firma válida de QStash no corre", async () => {
    mocks.verify.mockResolvedValue(false);
    const response = await POST(new Request("https://admin.test/api/internal/marketplaces/mercadolibre/health", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
    expect(mocks.job).not.toHaveBeenCalled();
  });

  it("con firma válida corre la misma revisión que el cron", async () => {
    mocks.verify.mockResolvedValue(true);
    const response = await POST(new Request("https://admin.test/api/internal/marketplaces/mercadolibre/health", { method: "POST", body: "{}" }));
    expect(response.status).toBe(200);
    expect(mocks.job).toHaveBeenCalledTimes(1);
  });
});
