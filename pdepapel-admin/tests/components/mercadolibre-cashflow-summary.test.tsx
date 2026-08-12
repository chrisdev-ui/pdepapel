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
          accountBalance: {
            state: "AVAILABLE",
            availableBalance: 46_457,
            totalAmount: 46_457,
            unavailableBalance: 0,
          },
          awaitingRelease: { amount: 0, orders: 0 },
          settlementPending: { orders: 0 },
          releaseStatusUnknown: { orders: 0 },
          upcomingReleases: [],
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
      ),
    );
    expect(await screen.findByText(/46\.457/)).toBeVisible();
  });
});
