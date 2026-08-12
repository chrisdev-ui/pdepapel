// @vitest-environment jsdom

import { MercadoLibreCashflowSummary } from "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/cashflow-summary";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("MercadoLibreCashflowSummary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads money information only when an administrator requests it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          awaitingRelease: { amount: 46_457, orders: 1 },
          settlementPending: { orders: 0 },
          releaseStatusUnknown: { orders: 0 },
          upcomingReleases: [
            {
              marketplaceOrderId: "marketplace-order-id",
              externalOrderId: "2000017813937484",
              netAmount: 46_457,
              paidAt: "2026-08-08T12:00:00.000Z",
              releaseDate: "2026-08-14T12:00:00.000Z",
            },
          ],
          updatedAt: "2026-08-11T12:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<MercadoLibreCashflowSummary storeId="store-id" />);

    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Consultar dinero" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/store-id/marketplaces/mercadolibre/cashflow",
        { method: "POST" },
      ),
    );
    expect((await screen.findAllByText(/46\.457/)).length).toBeGreaterThan(0);
  });
});
