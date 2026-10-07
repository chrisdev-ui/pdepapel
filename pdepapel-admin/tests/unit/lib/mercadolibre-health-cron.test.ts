import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findConnections: vi.fn(),
  getHealthSummary: vi.fn(),
  sendNotification: vi.fn(),
  sync: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
  lock: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceConnection: {
      findMany: mocks.findConnections,
    },
  },
}));

vi.mock("@/lib/mercadolibre/health", () => ({
  getMercadoLibreHealthSummary: mocks.getHealthSummary,
}));

vi.mock("@/lib/mercadolibre/health-alerts", () => ({
  identifyIssues: (issues: { kind: string; title: string }[]) =>
    issues.map((issue) => ({ ...issue, alertKey: `${issue.kind}:${issue.title}`, fingerprint: "f" })),
  syncAlertStates: mocks.sync,
  claimAlertsToNotify: mocks.claim,
  releaseAlertClaims: mocks.release,
  acquireRunLock: mocks.lock,
  releaseRunLock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/mercadolibre/health-notification", () => ({
  sendMercadoLibreHealthNotification: mocks.sendNotification,
}));

import { processMercadoLibreHealthChecks } from "@/lib/mercadolibre/health-cron";

const healthSummary = {
  totalListings: 0,
  activeListings: 0,
  unansweredQuestions: 0,
  shipmentsToDispatch: 0,
  claimsRequiringAttention: 0,
  grossSales: 0,
  netSales: 0,
  marketplaceCosts: 0,
  netProfit: 0,
  issues: [],
};

describe("Mercado Libre health cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sync.mockResolvedValue(undefined);
    mocks.claim.mockResolvedValue([]);
    mocks.release.mockResolvedValue(undefined);
    mocks.lock.mockResolvedValue(true);
  });

  it("continues processing healthy stores when one connection fails", async () => {
    mocks.findConnections.mockResolvedValue([
      { id: "connection-1", storeId: "store-1" },
      { id: "connection-2", storeId: "store-2" },
    ]);
    mocks.getHealthSummary.mockImplementation(async (connectionId: string) => {
      if (connectionId === "connection-2") {
        throw new Error("Mercado Libre is unavailable");
      }

      return healthSummary;
    });
    mocks.sendNotification.mockResolvedValue(undefined);

    await expect(processMercadoLibreHealthChecks()).resolves.toEqual({
      processed: [{ connectionId: "connection-1", issues: 0, notified: 0 }],
      failed: 1,
    });
    // Nada nuevo que avisar: ni se arma el correo.
    expect(mocks.sendNotification).not.toHaveBeenCalled();
    expect(mocks.getHealthSummary).toHaveBeenCalledWith("connection-1", {
      includeFinancials: false,
    });
  });

  it("does nothing when Mercado Libre is not connected", async () => {
    mocks.findConnections.mockResolvedValue([]);

    await expect(processMercadoLibreHealthChecks()).resolves.toEqual({
      processed: [],
      failed: 0,
    });
    expect(mocks.getHealthSummary).not.toHaveBeenCalled();
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  const stockIssue = { kind: "stock_risk", title: "Termo", detail: "x", listingId: "l-1" };

  it("emails only the alerts it could claim, counting the rest as already known", async () => {
    mocks.findConnections.mockResolvedValue([{ id: "connection-1", storeId: "store-1" }]);
    const second = { kind: "question", title: "¿Hay rojo?", detail: "y", entityId: "q-1" };
    mocks.getHealthSummary.mockResolvedValue({ ...healthSummary, issues: [stockIssue, second] });
    mocks.claim.mockImplementation(async (_c: string, issues: { kind: string }[]) =>
      issues.filter((issue) => issue.kind === "question").map((issue) => ({ issue, previousFingerprint: null, previousNotifiedAt: null })),
    );
    mocks.sendNotification.mockResolvedValue("sent");

    const result = await processMercadoLibreHealthChecks();

    expect(result.processed).toEqual([{ connectionId: "connection-1", issues: 2, notified: 1 }]);
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: "store-1", knownIssues: 1, issues: [expect.objectContaining({ kind: "question" })] }),
    );
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("gives the claimed alerts back when the email fails, so the next run retries", async () => {
    mocks.findConnections.mockResolvedValue([{ id: "connection-1", storeId: "store-1" }]);
    mocks.getHealthSummary.mockResolvedValue({ ...healthSummary, issues: [stockIssue] });
    const claims = [{ issue: { ...stockIssue, alertKey: "k", fingerprint: "f" }, previousFingerprint: null, previousNotifiedAt: null }];
    mocks.claim.mockResolvedValue(claims);
    mocks.sendNotification.mockRejectedValue(new Error("Resend rechazó la alerta"));

    const result = await processMercadoLibreHealthChecks();

    expect(result).toEqual({ processed: [], failed: 1 });
    expect(mocks.release).toHaveBeenCalledWith("connection-1", claims, expect.objectContaining({ now: expect.any(Date) }));
  });

  it("gives them back too when nothing was sent (development)", async () => {
    mocks.findConnections.mockResolvedValue([{ id: "connection-1", storeId: "store-1" }]);
    mocks.getHealthSummary.mockResolvedValue({ ...healthSummary, issues: [stockIssue] });
    mocks.claim.mockResolvedValue([{ issue: stockIssue, previousFingerprint: null, previousNotifiedAt: null }]);
    mocks.sendNotification.mockResolvedValue("skipped");

    const result = await processMercadoLibreHealthChecks();

    expect(result.processed).toEqual([{ connectionId: "connection-1", issues: 1, notified: 0 }]);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("a run that finds another one in progress for the connection sends nothing", async () => {
    mocks.findConnections.mockResolvedValue([{ id: "connection-1", storeId: "store-1" }]);
    mocks.getHealthSummary.mockResolvedValue({ ...healthSummary, issues: [stockIssue] });
    mocks.lock.mockResolvedValue(false);

    const result = await processMercadoLibreHealthChecks();

    expect(result.processed).toEqual([{ connectionId: "connection-1", issues: 1, notified: 0 }]);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });
});
